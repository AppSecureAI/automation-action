// src/main.ts

import * as core from '@actions/core'
import { readInputFiles, resolveInputFilePaths } from './file.js'
import type { SastInputFile } from './file.js'
import {
  getStatus,
  pollStatusUntilComplete,
  submitRun,
  finalizeRun
} from './service.js'
import store from './store.js'
import { SubmitRunError } from './errors.js'
import { VERSION, VERSION_INFO } from './version.js'
import {
  SubmitRunOutput,
  RunProcessTracking,
  RunSummary,
  GroupingConfig
} from './types.js'
import { LogLabels, getConsoleBranding, PollingConfig } from './constants.js'
import {
  getApiUrl,
  getMode,
  getUseTriageCc,
  getTriageMethod,
  getUseRemediateCc,
  getRemediateMethod,
  getUseValidateCc,
  getValidateMethod,
  getUseRemediateLoopCc,
  getAutoCreatePrs,
  getDebug,
  getToken,
  getGroupingEnabled,
  getGroupingStrategy,
  getMaxVulnerabilitiesPerPr,
  getGroupingStage,
  getUpdateContext,
  getFile,
  getFiles,
  getAllowLongRunHandoff
} from './input.js'
import {
  writeJobSummary,
  formatFinalResults,
  getDashboardUrl
} from './utils.js'
import { fetchPrTitles } from './titles.js'
import { fetchAndLogServerVersion } from './version-service.js'
/**
 * Log all input configuration in a collapsible group
 */
function logConfiguration(filePaths: string[]): void {
  core.startGroup('Input Configuration')
  core.info(`Files: ${filePaths.join(', ')}`)
  core.info(`API URL: ${getApiUrl()}`)
  core.info(`Processing Mode: ${getMode()}`)
  core.info(`Use Triage CC: ${getUseTriageCc()}`)
  core.info(`Triage Method: ${getTriageMethod()}`)
  core.info(`Use Remediate CC: ${getUseRemediateCc()}`)
  core.info(`Remediate Method: ${getRemediateMethod()}`)
  core.info(`Use Validate CC: ${getUseValidateCc()}`)
  core.info(`Validate Method: ${getValidateMethod()}`)
  core.info(`Use Remediate Loop CC: ${getUseRemediateLoopCc()}`)
  core.info(`Auto Create PRs: ${getAutoCreatePrs()}`)
  const groupingEnabled = getGroupingEnabled()
  core.info(`Grouping Enabled: ${groupingEnabled}`)
  if (groupingEnabled) {
    core.info(`Grouping Strategy: ${getGroupingStrategy()}`)
    core.info(`Max Vulnerabilities Per PR: ${getMaxVulnerabilitiesPerPr()}`)
    core.info(`Grouping Stage: ${getGroupingStage()}`)
  }
  core.info(`Update Context: ${getUpdateContext()}`)
  core.endGroup()
}

/**
 * Build the user-facing message for a paused run.
 *
 * A paused run is a distinct, non-failure outcome: the server has temporarily
 * halted work (e.g. sustained provider throttling) but preserved progress and
 * will resume automatically once capacity returns. The optional reason is
 * surfaced when the server provides one.
 */
export function buildPausedMessage(reason?: string | null): string {
  const trimmedReason = reason?.trim()
  const detail = trimmedReason
    ? `: ${trimmedReason}`
    : ': sustained provider throttling'
  return (
    `Run paused${detail} — work preserved; it will resume automatically ` +
    'when capacity returns. Track it in the AppSecAI dashboard.'
  )
}

function setRunEvidenceOutputs(
  runId: string | null | undefined,
  status: string,
  dashboardUrl?: string,
  complete = false
): void {
  core.setOutput('run-id', runId ?? '')
  core.setOutput('run-status', status)
  core.setOutput('run-complete', complete ? 'true' : 'false')
  core.setOutput('dashboard-url', dashboardUrl ?? '')
}

export async function run(): Promise<void> {
  core.info(`${VERSION_INFO.name} v${VERSION}`)

  // Fetch and log server version information (non-blocking to avoid startup latency)
  fetchAndLogServerVersion(getApiUrl()).catch(() => {
    // Silently ignore - version check is purely informational
  })

  const file: string = getFile()
  const files: string = getFiles()
  const isDebug = getDebug()
  const allowLongRunHandoff = getAllowLongRunHandoff()

  // Polling configuration for status checks (from constants.ts)
  const pollDelay = PollingConfig.POLL_DELAY_MS
  const intervalCheck = PollingConfig.INTERVAL_CHECK_MS
  const retries = PollingConfig.MAX_RETRIES

  let inputFiles: SastInputFile[]
  let filePaths: string[] = []
  let submitOutput: SubmitRunOutput
  let finalProcessTracking: RunProcessTracking | null = null
  let finalSummary: RunSummary | null = null
  let finalDashboardUrl: string | undefined
  const startTime = Date.now()
  let success = false
  let monitoringIndeterminate = false
  let runStillActiveAfterPollingLimit = false
  let productRunFailureMessage: string | null = null
  let pollingLimitFailureMessage: string | null = null
  let runPausedMessage: string | null = null
  let runStillProcessingMessage: string | null = null
  let runStillProcessingStatus: string | null = null
  let finalRunStatusOutput = ''

  try {
    filePaths = resolveInputFilePaths(file, files)

    // Display AppSecAI branding at run start
    core.info('')
    core.info(getConsoleBranding())
    core.info('')
    core.info(`${VERSION_INFO.name} v${VERSION}`)
    core.info(
      '======== Getting static analysis results for further processing. ========'
    )

    // Log configuration in collapsible group only if debug is enabled
    if (isDebug) {
      logConfiguration(filePaths)
    }

    // Step 1: Read the file inputs
    core.startGroup(
      `File Processing (${filePaths.length} file${filePaths.length === 1 ? '' : 's'})`
    )
    try {
      inputFiles = await readInputFiles(filePaths)
      core.info(`Successfully read files: ${filePaths.join(', ')}`)
    } catch (error) {
      core.debug(`Error reading file: ${error}.`)
      core.endGroup()
      // Re-throw to be caught by the outer block and handled as a final error
      throw error
    }
    core.endGroup()

    // Step 2: Submit the run
    core.startGroup('Run Submission')
    const intervalId = setInterval(() => {
      core.info(`[${LogLabels.RUN_SUBMIT}] submit in progress...`)
    }, intervalCheck)

    try {
      submitOutput = await submitRun(inputFiles)
      core.info(submitOutput.message)
    } catch (error) {
      core.debug(`Error submit run ${error}`)
      core.endGroup()
      const submitErrorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to submit analysis results for processing. Please try again later.'
      // Re-throw to be caught by the outer block
      throw new SubmitRunError(submitErrorMessage, error)
    } finally {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
    core.endGroup()

    // Step 3: Poll for status (non-critical failure)
    if (submitOutput.run_id) {
      const cleanupApiUrl = getApiUrl()
      store.id = submitOutput.run_id
      store.organizationId = submitOutput.organization_id
      core.saveState('runId', submitOutput.run_id)
      core.saveState('organizationId', submitOutput.organization_id ?? '')
      core.saveState('apiUrl', cleanupApiUrl)
      finalRunStatusOutput = 'submitted'

      const cancelAuthToken = getToken()
      if (cancelAuthToken) {
        core.setSecret(cancelAuthToken)
        core.saveState('cancelAuthToken', cancelAuthToken)
      }

      core.info(
        `[${LogLabels.RUN_STATUS}] Monitoring analysis status for run ID '${store.id}'. This may take some time.`
      )
      try {
        const getRunStatus = () => getStatus(store.id, store.organizationId)
        const pollResult = await pollStatusUntilComplete(
          getRunStatus,
          retries,
          pollDelay
        )
        if (!pollResult) {
          try {
            const finalStatus = await getRunStatus()
            if (finalStatus.status === 'completed') {
              finalRunStatusOutput = 'completed'
              if (finalStatus.processTracking) {
                finalProcessTracking =
                  finalStatus.processTracking as RunProcessTracking
              }
              if (finalStatus.summary) {
                finalSummary = finalStatus.summary as RunSummary
              }
              if (finalStatus.dashboard_url) {
                finalDashboardUrl = finalStatus.dashboard_url
              }
            } else if (finalStatus.status === 'paused') {
              finalRunStatusOutput = 'paused'
              // Run is paused (non-failure): report it clearly rather than
              // treating the indeterminate timeout as a degraded outcome.
              runPausedMessage = buildPausedMessage(
                finalStatus.pauseReason ?? finalStatus.diagnostic
              )
              runStillActiveAfterPollingLimit = true
            } else if (finalStatus.status === 'failed') {
              finalRunStatusOutput = 'failed'
              productRunFailureMessage = finalStatus.error
                ? `Product run failed: ${finalStatus.error}`
                : 'Product run failed.'
            } else {
              finalRunStatusOutput = finalStatus.status || 'processing'
              runStillActiveAfterPollingLimit =
                finalStatus.status !== 'network_error'
              monitoringIndeterminate = !runStillActiveAfterPollingLimit
              const statusDescription =
                finalStatus.status || 'unknown non-terminal status'
              if (finalStatus.dashboard_url) {
                finalDashboardUrl = finalStatus.dashboard_url
              }
              const dashboardText = finalStatus.dashboard_url
                ? ` Dashboard: ${finalStatus.dashboard_url}`
                : ''
              core.warning(
                `[${LogLabels.RUN_STATUS}] Polling limit reached and final status check returned "${statusDescription}". ` +
                  'Skipping summary finalization because the server run is not known to be terminal.' +
                  dashboardText
              )
              if (runStillActiveAfterPollingLimit) {
                if (allowLongRunHandoff) {
                  runStillProcessingStatus = statusDescription
                  runStillProcessingMessage =
                    `AppSecAI run ${store.id} is still processing after the GitHub Action monitoring window. ` +
                    'The server accepted the run and work is continuing; monitor the AppSecAI dashboard for final results.' +
                    dashboardText
                } else {
                  pollingLimitFailureMessage =
                    `AppSecAI run ${store.id} did not reach a terminal status before the GitHub Action monitoring window expired ` +
                    `(last status: ${statusDescription}). No final summary is available, so the action is failing closed. ` +
                    'Set allow-long-run-handoff: true only for workflows that intentionally do not gate on completed analysis.' +
                    dashboardText
                }
              }
            }
          } catch (finalStatusError) {
            finalRunStatusOutput = 'unknown'
            monitoringIndeterminate = true
            runStillActiveAfterPollingLimit = true
            const errorMessage =
              finalStatusError instanceof Error
                ? finalStatusError.message
                : String(finalStatusError)
            core.warning(
              `[${LogLabels.RUN_STATUS}] Polling limit reached and final status check failed: ${errorMessage}. ` +
                'Skipping summary finalization because the server run may still be active.'
            )
          }
        }
        // Capture final process tracking and summary for job summary
        // Type assertions are safe here because Zod schema validation ensures complete data
        if (pollResult?.processTracking) {
          finalProcessTracking =
            pollResult.processTracking as RunProcessTracking
        }
        if (pollResult?.summary) {
          finalSummary = pollResult.summary as RunSummary
        }
        if (pollResult?.dashboard_url) {
          finalDashboardUrl = pollResult.dashboard_url
        }
        if (pollResult?.status) {
          finalRunStatusOutput = pollResult.status
        }
        if (pollResult?.status === 'failed') {
          productRunFailureMessage = pollResult.error
            ? `Product run failed: ${pollResult.error}`
            : 'Product run failed.'
        }
        if (pollResult?.status === 'paused') {
          runPausedMessage = buildPausedMessage(
            pollResult.pauseReason ?? pollResult.diagnostic
          )
          // A paused run is non-terminal: skip terminal-summary finalization
          // so we do not mis-report it, but do NOT mark it failed.
          runStillActiveAfterPollingLimit = true
        }
      } catch (pollError) {
        finalRunStatusOutput = 'unknown'
        monitoringIndeterminate = true
        runStillActiveAfterPollingLimit = true
        // This is a "soft" failure. Log a warning but let the process complete
        core.warning(
          `[${LogLabels.RUN_STATUS}] Failed to poll status for run_id: ${store.id}. The analysis may still be running on the server.`
        )
      }
    }

    if (productRunFailureMessage) {
      throw new Error(productRunFailureMessage)
    }
    if (pollingLimitFailureMessage) {
      throw new Error(pollingLimitFailureMessage)
    }

    success = true
    if (runPausedMessage) {
      // Paused is a successful (non-failure) terminal outcome for this run:
      // print a clear message and exit without a failure exit code.
      core.notice(runPausedMessage)
      core.setOutput('message', runPausedMessage)
    } else if (runStillProcessingMessage) {
      // Server-side processing outlived the GitHub Action monitoring window.
      // This is not a Product failure: the accepted run remains active and the
      // dashboard is the source of truth for final results.
      core.notice(runStillProcessingMessage)
      core.setOutput('message', runStillProcessingMessage)
      core.setOutput('run-status', runStillProcessingStatus ?? 'active')
      core.setOutput('run-complete', 'false')
      if (finalDashboardUrl) {
        core.setOutput('dashboard-url', finalDashboardUrl)
      }
    } else {
      core.setOutput('message', 'Processing completed successfully.')
    }
  } catch (error) {
    // This is the final catch for any critical errors
    let errorMessage =
      'An unexpected error occurred. Please check the logs for details.'

    if (error instanceof Error && 'code' in error) {
      const err = error as NodeJS.ErrnoException
      switch (err.code) {
        case 'ENOENT':
          errorMessage = `File not found. Please check if every file path is correct and exists.`
          break
        case 'ENODATA':
          errorMessage = `File is empty or could not be read. Please check if every file contains data.`
          break
        case 'EINVAL':
          errorMessage = `Invalid file path: path cannot be empty, contain only whitespace, or have unsupported file extension. Supported formats: .json, .sarif, .csv, .tsv, .xml`
          break
        default:
          errorMessage = `An error occurred while processing files: ${filePaths.join(', ')}. Please verify each file is accessible and properly formatted.`
      }

      errorMessage = `${errorMessage} Aborting process.`
    } else if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    core.error(errorMessage)
    core.setFailed(errorMessage)
    if (!finalRunStatusOutput) {
      finalRunStatusOutput = store.id ? 'failed' : 'not_created'
    }
  } finally {
    // Always try to finalize and get summary when we have a run ID
    // This ensures summary data is available even on timeout or failure
    if (store.id && !runStillActiveAfterPollingLimit) {
      core.info('Finalizing run and fetching summary...')

      // Get expected customer-visible PR count to verify summary completeness
      // This addresses the race condition where summary may be computed before all PRs are persisted
      const expectedPrCount =
        finalSummary?.customer_visible_pr_count ??
        finalSummary?.pr_count ??
        finalProcessTracking?.push_status?.customer_visible_pr_count ??
        finalProcessTracking?.push_status?.success_count
      const finalizeSummary = await finalizeRun(store.id, {
        expectedPrCount,
        organizationId: store.organizationId
      })

      // Use finalize summary if we don't already have one from polling
      if (finalizeSummary && !finalSummary) {
        finalSummary = finalizeSummary
      }
      if (!finalRunStatusOutput) {
        finalRunStatusOutput = 'completed'
      }
    } else if (store.id) {
      core.warning(
        'Skipping final summary computation because monitoring ended before the server run reached a terminal state.'
      )
    }

    if (success && store.id && monitoringIndeterminate && !finalSummary) {
      success = false
      const errorMessage =
        'Run monitoring became indeterminate and final summary data was unavailable. ' +
        'The server may have been unreachable or degraded while the run was still in progress.'
      core.error(errorMessage)
      core.setFailed(errorMessage)
    }

    // Write job summary
    const durationMs = Date.now() - startTime

    // Prefer backend-provided title maps, but keep the previous GitHub lookup fallback
    // so summaries do not regress to URL-only output when older servers omit them.
    let prTitles = finalSummary?.pr_titles
      ? new Map(Object.entries(finalSummary.pr_titles))
      : undefined
    if (!prTitles && finalSummary && finalSummary.pr_urls.length > 0) {
      try {
        const token = getToken()
        if (token) {
          prTitles = await fetchPrTitles(finalSummary.pr_urls, token)
        }
      } catch (error) {
        core.debug(`Failed to fetch PR titles: ${error}`)
      }
    }
    // Prefer canonical issue_titles_by_url; fall back to legacy issue_titles for backward compatibility
    const issueTitles = finalSummary?.issue_titles_by_url
      ? new Map(Object.entries(finalSummary.issue_titles_by_url))
      : finalSummary?.issue_titles
        ? new Map(Object.entries(finalSummary.issue_titles))
        : undefined
    const dashboardUrl = finalDashboardUrl ?? getDashboardUrl(getApiUrl())
    setRunEvidenceOutputs(
      store.id || null,
      finalRunStatusOutput || (store.id ? 'unknown' : 'not_created'),
      store.id ? dashboardUrl : undefined,
      success &&
        !runStillActiveAfterPollingLimit &&
        finalRunStatusOutput === 'completed'
    )

    // Build grouping config for summary display
    const groupingEnabled = getGroupingEnabled()
    let groupingConfig: GroupingConfig | undefined
    if (groupingEnabled) {
      groupingConfig = {
        enabled: true,
        strategy: getGroupingStrategy(),
        maxVulnerabilitiesPerPr: getMaxVulnerabilitiesPerPr(),
        stage: getGroupingStage()
      }
    }

    await writeJobSummary(
      finalProcessTracking,
      finalSummary,
      store.id,
      durationMs,
      success,
      prTitles,
      dashboardUrl,
      groupingConfig,
      issueTitles
    )

    // Final summary
    core.startGroup('Final Results')
    const finalResultsOutput = formatFinalResults(
      finalSummary,
      store.id,
      durationMs,
      finalProcessTracking,
      prTitles,
      dashboardUrl,
      groupingConfig,
      issueTitles
    )
    core.info(finalResultsOutput)
    core.endGroup()
  }
}
