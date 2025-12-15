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
import store from './store.js'
import { SubmitRunError } from './errors.js'
import { SubmitRunOutput, RunProcessTracking, RunSummary } from './types.js'
import { LogLabels } from './constants.js'
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
  getDebug
} from './input.js'
import { writeJobSummary, formatFinalResults } from './utils.js'

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
  core.endGroup()
}

export async function run(): Promise<void> {
  const file: string = core.getInput('file')
  const isDebug = getDebug()

  // Polling configuration for status checks
  // pollDelay: Wait time between status check attempts (30 seconds)
  // intervalCheck: Display progress messages every 30 seconds during submission
  // retries: Maximum number of polling attempts (50 retries × 30s = ~25 minutes total)
  const pollDelay = 30000
  const intervalCheck = 30000
  const retries = 50

  let fileBuffer: Buffer
  let submitOutput: SubmitRunOutput
  let finalProcessTracking: RunProcessTracking | null = null
  let finalSummary: RunSummary | null = null
  const startTime = Date.now()
  let success = false

  try {
    core.info(
      '======== Getting static analysis results for further processing. ========'
    )

    // Log configuration in collapsible group only if debug is enabled
    if (isDebug) {
      logConfiguration(file)
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
      // Re-throw to be caught by the outer block
      throw new SubmitRunError(
        `Failed to submit analysis results for processing. Please try again later.`,
        error
      )
    } finally {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
    core.endGroup()

    // Step 3: Poll for status (non-critical failure)
    if (submitOutput.run_id) {
      store.id = submitOutput.run_id

      core.info(
        `[${LogLabels.RUN_STATUS}] Monitoring analysis status for run ID '${store.id}'. This may take some time.`
      )
      try {
        const getRunStatus = () => getStatus(store.id)
        const pollResult = await pollStatusUntilComplete(
          getRunStatus,
          retries,
          pollDelay
        )
        // Capture final process tracking and summary for job summary
        if (pollResult?.processTracking) {
          finalProcessTracking = pollResult.processTracking
        }
        if (pollResult?.summary) {
          finalSummary = pollResult.summary
        }
      } catch (pollError) {
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
      const finalizeSummary = await finalizeRun(store.id, { expectedPrCount })

      // Use finalize summary if we don't already have one from polling
      if (finalizeSummary && !finalSummary) {
        finalSummary = finalizeSummary
      }
    }

    // Write job summary
    const durationMs = Date.now() - startTime
    await writeJobSummary(
      finalProcessTracking,
      finalSummary,
      store.id,
      durationMs,
      success
    )

    // Final summary
    core.startGroup('Final Results')
    const finalResultsOutput = formatFinalResults(
      finalSummary,
      store.id,
      durationMs
    )
    core.info(finalResultsOutput)
    core.endGroup()
  }
}
