// src/main.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import { readFile } from './file.js'
import {
  getStatus,
  pollStatusUntilComplete,
  submitRun,
  finalizeRun
} from './service.js'
import { fetchPrTitles } from './titles.js'
import store from './store.js'
import { SubmitRunError } from './errors.js'
import { VERSION } from './version.js'
import {
  SubmitRunOutput,
  RunProcessTracking,
  RunSummary,
  GroupingConfig,
  ProcessingModeExternal
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
  getRegressionEvidenceBaseRef,
  getRegressionEvidenceBaseSha,
  getRegressionEvidenceHeadRef,
  getRegressionEvidenceHeadSha,
  getRegressionEvidenceCoverageArtifacts,
  getRegressionEvidenceTestCommands,
  getRegressionEvidenceOutputJsonPath,
  getRegressionEvidenceOutputMarkdownPath,
  getRegressionEvidenceAllowPartial,
  getRegressionEvidenceFailOnAtRisk,
  getRegressionEvidencePublishComment,
  getGroupingEnabled,
  getGroupingStrategy,
  getMaxVulnerabilitiesPerPr,
  getGroupingStage,
  getUpdateContext
} from './input.js'
import {
  writeJobSummary,
  formatFinalResults,
  getDashboardUrl
} from './utils.js'
import { fetchAndLogServerVersion } from './version-service.js'
import {
  RegressionEvidenceStatus,
  generateRegressionEvidence,
  parseRegressionEvidenceArtifactListInput,
  parseRegressionEvidenceTestCommandsInput,
  publishRegressionEvidenceCommentFromContext
} from './regression-evidence.js'

/**
 * Log all input configuration in a collapsible group
 */
function logConfiguration(file: string): void {
  core.startGroup('Input Configuration')
  core.info(`File: ${file}`)
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
  if (getMode() === ProcessingModeExternal.REGRESSION_EVIDENCE) {
    core.info(`Regression Evidence Base Ref: ${getRegressionEvidenceBaseRef()}`)
    core.info(`Regression Evidence Base SHA: ${getRegressionEvidenceBaseSha()}`)
    core.info(`Regression Evidence Head Ref: ${getRegressionEvidenceHeadRef()}`)
    core.info(`Regression Evidence Head SHA: ${getRegressionEvidenceHeadSha()}`)
    core.info(
      `Regression Evidence Coverage Artifacts: ${getRegressionEvidenceCoverageArtifacts()}`
    )
    core.info(
      `Regression Evidence Test Commands: ${getRegressionEvidenceTestCommands()}`
    )
    core.info(
      `Regression Evidence Output JSON Path: ${getRegressionEvidenceOutputJsonPath()}`
    )
    core.info(
      `Regression Evidence Output Markdown Path: ${getRegressionEvidenceOutputMarkdownPath()}`
    )
    core.info(
      `Regression Evidence Allow Partial: ${getRegressionEvidenceAllowPartial()}`
    )
    core.info(
      `Regression Evidence Fail On At Risk: ${getRegressionEvidenceFailOnAtRisk()}`
    )
    core.info(
      `Regression Evidence Publish Comment: ${getRegressionEvidencePublishComment()}`
    )
  }
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

async function runRegressionEvidenceMode(): Promise<void> {
  core.startGroup('Regression Evidence')
  try {
    const result = await generateRegressionEvidence({
      cwd: process.cwd(),
      baseRef: getRegressionEvidenceBaseRef() || null,
      baseSha: getRegressionEvidenceBaseSha() || null,
      headRef: getRegressionEvidenceHeadRef() || null,
      headSha: getRegressionEvidenceHeadSha() || null,
      coverageArtifactPaths: parseRegressionEvidenceArtifactListInput(
        getRegressionEvidenceCoverageArtifacts()
      ),
      testCommands: parseRegressionEvidenceTestCommandsInput(
        getRegressionEvidenceTestCommands()
      ),
      outputJsonPath: getRegressionEvidenceOutputJsonPath(),
      outputMarkdownPath: getRegressionEvidenceOutputMarkdownPath(),
      allowPartial: getRegressionEvidenceAllowPartial()
    })

    core.setOutput('regression-evidence-status', result.artifact.status)
    core.setOutput('regression-evidence-json-path', result.jsonPath)
    core.setOutput('regression-evidence-markdown-path', result.markdownPath)

    core.summary.addRaw(result.markdown)
    await core.summary.write()
    core.info('Regression evidence artifacts generated.')

    if (getRegressionEvidencePublishComment()) {
      const token =
        getToken() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      const action = await publishRegressionEvidenceCommentFromContext(
        result.markdown,
        token || ''
      )
      if (action !== 'skipped') {
        core.info(`Regression evidence PR comment ${action}.`)
      }
    }

    if (
      getRegressionEvidenceFailOnAtRisk() &&
      result.artifact.status === RegressionEvidenceStatus.AT_RISK
    ) {
      throw new Error(
        'Regression evidence status is at_risk and fail-on-at-risk is enabled.'
      )
    }
  } finally {
    core.endGroup()
  }
}

export async function run(): Promise<void> {
  core.info(`submit-run-action v${VERSION}`)

  // Fetch and log server version information (non-blocking to avoid startup latency)
  fetchAndLogServerVersion(getApiUrl()).catch(() => {
    // Silently ignore - version check is purely informational
  })

  const file: string = core.getInput('file')
  const isDebug = getDebug()

  // Polling configuration for status checks (from constants.ts)
  const pollDelay = PollingConfig.POLL_DELAY_MS
  const intervalCheck = PollingConfig.INTERVAL_CHECK_MS
  const retries = PollingConfig.MAX_RETRIES

  let fileBuffer: Buffer
  let submitOutput: SubmitRunOutput
  let finalProcessTracking: RunProcessTracking | null = null
  let finalSummary: RunSummary | null = null
  const startTime = Date.now()
  let success = false
  let monitoringIndeterminate = false

  try {
    // Display AppSecAI branding at run start
    core.info('')
    core.info(getConsoleBranding())
    core.info('')
    core.info(`submit-run-action v${VERSION}`)
    core.info(
      '======== Getting static analysis results for further processing. ========'
    )

    // Log configuration in collapsible group only if debug is enabled
    if (isDebug) {
      logConfiguration(file)
    }

    if (getMode() === ProcessingModeExternal.REGRESSION_EVIDENCE) {
      await runRegressionEvidenceMode()
      success = true
      core.setOutput('message', 'Regression evidence generated successfully.')
      return
    }

    // Step 1: Read the file
    core.startGroup(`File Processing (${file})`)
    try {
      fileBuffer = await readFile(file)
      core.info(`Successfully read file: ${file}`)
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
      submitOutput = await submitRun(fileBuffer, file)
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
      store.id = submitOutput.run_id
      store.organizationId = submitOutput.organization_id

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
          monitoringIndeterminate = true
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
      } catch (pollError) {
        monitoringIndeterminate = true
        // This is a "soft" failure. Log a warning but let the process complete
        core.warning(
          `[${LogLabels.RUN_STATUS}] Failed to poll status for run_id: ${store.id}. The analysis may still be running on the server.`
        )
      }
    }

    success = true
    core.setOutput('message', 'Processing completed successfully.')
  } catch (error) {
    // This is the final catch for any critical errors
    let errorMessage =
      'An unexpected error occurred. Please check the logs for details.'

    if (error instanceof Error && 'code' in error) {
      const err = error as NodeJS.ErrnoException
      switch (err.code) {
        case 'ENOENT':
          errorMessage = `File not found: ${file}. Please check if the file path is correct and the file exists.`
          break
        case 'ENODATA':
          errorMessage = `File is empty or could not be read: ${file}. Please check if the file contains data.`
          break
        case 'EINVAL':
          errorMessage = `Invalid file path: path cannot be empty, contain only whitespace, or have unsupported file extension. Supported formats: .json, .sarif`
          break
        default:
          errorMessage = `An error occurred while processing the file: ${file}. Please verify the file is accessible and properly formatted.`
      }

      errorMessage = `${errorMessage} Aborting process.`
    } else if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    core.error(errorMessage)
    core.setFailed(errorMessage)
  } finally {
    // Always try to finalize and get summary when we have a run ID
    // This ensures summary data is available even on timeout or failure
    if (store.id) {
      core.info('Finalizing run and fetching summary...')

      // Get expected PR count from push_status.success_count to verify summary completeness
      // This addresses the race condition where summary may be computed before all PRs are persisted
      const expectedPrCount = finalProcessTracking?.push_status?.success_count
      const finalizeSummary = await finalizeRun(store.id, {
        expectedPrCount,
        organizationId: store.organizationId
      })

      // Use finalize summary if we don't already have one from polling
      if (finalizeSummary && !finalSummary) {
        finalSummary = finalizeSummary
      }
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

    // Fetch PR titles if we have a summary with PRs
    let prTitles: Map<string, string> | undefined
    if (finalSummary && finalSummary.pr_urls.length > 0) {
      try {
        const token = getToken()
        if (token) {
          prTitles = await fetchPrTitles(finalSummary.pr_urls, token)
        }
      } catch (error) {
        core.debug(`Failed to fetch PR titles: ${error}`)
      }
    }

    // Get dashboard URL
    const dashboardUrl = getDashboardUrl(getApiUrl())

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
      groupingConfig
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
      groupingConfig
    )
    core.info(finalResultsOutput)
    core.endGroup()
  }
}
