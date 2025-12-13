// src/service.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import axios from 'axios'
import {
  RunResponseSchema,
  ResponseStatusSchema,
  StepListSchema,
  RunSummarySchema
} from './schemas.js'
import { getIdToken } from './github.js'
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
  getAutoCreatePrs
} from './input.js'
import {
  SubmitRunOutput,
  StructuredErrorDetail,
  PlanErrorCode,
  RunSummary
} from './types.js'
import store from './store.js'
import { logSteps, logProcessTracking, logSummary } from './utils.js'
import { LogLabels } from './constants.js'

const API_TIMEOUT = 8 * 60 * 1000

export async function submitRun(
  file: Buffer,
  fileName: string
): Promise<SubmitRunOutput> {
  const apiUrl = getApiUrl()
  const token = await getIdToken(apiUrl)
  const url = `${apiUrl}/api-product/submit`
  const mode = getMode()

  core.info(`Processing mode: ${mode}`)

  const formData = new FormData()
  formData.append('file', new Blob([file]), fileName)
  formData.append('processing_mode', mode)

  // Add AI solver variant parameters
  formData.append('use_triage_cc', String(getUseTriageCc()))
  formData.append('triage_method', getTriageMethod())
  formData.append('use_remediate_cc', String(getUseRemediateCc()))
  formData.append('remediate_method', getRemediateMethod())
  formData.append('use_validate_cc', String(getUseValidateCc()))
  formData.append('validate_method', getValidateMethod())
  formData.append('use_remediate_loop_cc', String(getUseRemediateLoopCc()))

  // Add PR creation flag
  formData.append('auto_create_prs', String(getAutoCreatePrs()))

  core.debug('Calling submit API: POST /api-product/submit')

  const setup = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    timeout: API_TIMEOUT
  }
  const prefixLabel = `[${LogLabels.RUN_SUBMIT}]`
  core.info(`${prefixLabel} Submitting analysis results for processing...`)

  return axios
    .post(url, formData, setup)
    .then((response) => {
      const parsedResponse = RunResponseSchema.safeParse(response.data)

      if (!parsedResponse.success) {
        const errorMessage = `${prefixLabel} Call failed: Received an unexpected response format from the server. Please contact support if this issue persists.`
        core.error(errorMessage)
        throw new Error(errorMessage)
      }

      const validData = parsedResponse.data

      core.info(`${prefixLabel} call succeeded`)
      core.info('======= process =======')

      logSteps(validData.steps, LogLabels.RUN_SUBMIT)

      return {
        message: validData.message,
        run_id: validData.run_id
      } as SubmitRunOutput
    })
    .catch((error) => {
      let errorMessage = `${prefixLabel} Call failed: An unexpected error occurred. Please try again later.`

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = `${prefixLabel} Call failed: Request timed out. Please try again later.`
        } else if (error.response?.data) {
          const apiDetail = error.response.data.detail

          // Handle both string and structured error detail formats
          if (typeof apiDetail === 'string') {
            // Simple string detail (legacy format)
            errorMessage = `${prefixLabel} ${apiDetail}`
          } else if (typeof apiDetail === 'object' && apiDetail !== null) {
            // Structured detail with code and description (new format)
            const structuredDetail = apiDetail as StructuredErrorDetail
            const code = structuredDetail.code ?? PlanErrorCode.UNKNOWN
            const description =
              structuredDetail.description ??
              'An error occurred. Please try again.'

            // Format: [RUN_SUBMIT] [PLAN_EXPIRED] Plan expired on 2025-12-01...
            errorMessage = `${prefixLabel} [${code}] ${description}`

            // Log additional context for debugging if available
            if (structuredDetail.organization_id) {
              core.debug(`Organization ID: ${structuredDetail.organization_id}`)
            }
            if (structuredDetail.expires_at) {
              core.debug(`Plan expires at: ${structuredDetail.expires_at}`)
            }
            if (structuredDetail.status) {
              core.debug(`Plan status: ${structuredDetail.status}`)
            }
          }

          // Handle step list if present (works with both formats)
          if (apiDetail?.steps) {
            const stepList = StepListSchema.safeParse(apiDetail.steps)
            if (stepList.success) {
              logSteps(stepList.data, LogLabels.RUN_SUBMIT)
            } else {
              // Removed technical error details
            }
          }
        } else {
          errorMessage = `${prefixLabel} Call failed: ${error.message}`
        }
      } else {
        core.debug(`Original error: ${error.toString()}`)
      }

      core.error(errorMessage)
      throw new Error(errorMessage)
    })
}

export async function getStatus(id: string) {
  const apiUrl = getApiUrl()
  const token = await getIdToken(apiUrl)
  const url = `${apiUrl}/api-product/submit/status/${id}`
  const prefixLabel = `[${LogLabels.RUN_STATUS}]`

  core.debug(`Calling status API: GET /api-product/submit/status/${id}`)

  const setup = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    timeout: 8000
  }

  return axios
    .get(url, setup)
    .then((response) => {
      const parsedResponse = ResponseStatusSchema.safeParse(response.data)

      if (!parsedResponse.success) {
        const errorMessage = `${prefixLabel} failed: Received an unexpected response format from the server. Please contact support if this issue persists.`
        core.error(errorMessage)
        throw new Error(errorMessage)
      }

      const results = parsedResponse.data.results
      const processTracking = parsedResponse.data.process_tracking
      const summary = parsedResponse.data.summary
      let totalVulns = 0

      // Log process tracking information if available (Issue #181)
      if (processTracking) {
        logProcessTracking(processTracking, prefixLabel)
      }

      if (results) {
        if (results.find && typeof results.find.count === 'number') {
          totalVulns = results.find.count
        }

        for (const [key, value] of Object.entries(results)) {
          // Skip non-solver fields (description is a string, not a solver result)
          if (key === 'description' || typeof value !== 'object' || !value) {
            continue
          }
          if (!store.finalLogPrinted[key]) {
            if (key === 'find' && Array.isArray(value?.extras?.cwe_list)) {
              core.info(
                `${prefixLabel}: CWE found: ${value?.extras?.cwe_list.join(', ')}`
              )
            }

            if (key === 'triage') {
              if (value?.extras?.true_positives) {
                core.info(
                  `${prefixLabel}: True positives found: ${value?.extras?.true_positives}`
                )
              }
              if (value?.extras?.false_positives) {
                core.info(
                  `${prefixLabel}: False positives found: ${value?.extras?.false_positives}`
                )
              }
            }

            if (value) {
              core.info(
                `${prefixLabel}: ${key} ..... processed ${value.count} vulnerabilities`
              )
              if (value.count === totalVulns) {
                core.info(
                  `${prefixLabel}: ${key} solver has processed all vulnerabilities!`
                )
                store.finalLogPrinted[key] = true
              }
            }
          }
        }
      } else if (!processTracking) {
        // Only show generic message if we have neither results nor process_tracking
        core.debug(`${prefixLabel}: No results found (.......)`)
        core.info('.......')
      }
      core.info('======= ***** =======')

      // Determine completion status from overall_status if available
      const overallStatus = processTracking?.overall_status?.status
      if (overallStatus === 'completed') {
        core.info(`${prefixLabel}: Processing completed successfully`)
        return { status: 'completed', processTracking, summary }
      } else if (overallStatus === 'failed') {
        const errorMsg =
          processTracking?.overall_status?.error_message || 'Processing failed'
        core.error(`${prefixLabel}: Processing failed - ${errorMsg}`)
        return { status: 'failed', error: errorMsg, processTracking, summary }
      }

      // Fallback: Check process_tracking stage statuses when overall_status isn't set
      // This handles cases where processing is done but overall_status wasn't updated
      if (processTracking) {
        const pushStatus = processTracking.push_status?.status
        // Terminal statuses for push stage (matches backend PUSH_TERMINAL_STATUSES)
        const pushTerminalStatuses = ['completed', 'failed', 'not_scheduled']

        // Check if push stage has reached a terminal state
        if (pushStatus && pushTerminalStatuses.includes(pushStatus)) {
          // Only mark as completed if push succeeded or was skipped (not_scheduled)
          // Failed push should still return progress to allow retry detection
          if (pushStatus === 'completed' || pushStatus === 'not_scheduled') {
            core.info(
              `${prefixLabel}: Push stage ${pushStatus} - marking run as complete`
            )
            return { status: 'completed', processTracking, summary }
          }
        }

        // Check if remediation loop is completed and there's no push stage configured
        // (for runs that don't have push in their pipeline)
        if (
          processTracking.remediation_validation_loop_status?.status ===
            'completed' &&
          !processTracking.push_status
        ) {
          core.info(
            `${prefixLabel}: Remediation stage completed (no push) - marking run as complete`
          )
          return { status: 'completed', processTracking, summary }
        }
      }

      return { status: 'progress', processTracking, summary }
    })
    .catch((error) => {
      if (
        error.message &&
        error.message.includes('unexpected response format')
      ) {
        throw error
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status) {
          core.warning(
            `${prefixLabel} Call failed with status code: ${status}. Please try again later.`
          )
        } else if (error.code === 'ECONNABORTED') {
          core.warning(
            `${prefixLabel} Call failed: Request timed out. Please try again later.`
          )
        } else {
          core.warning(`${prefixLabel} Call failed: ${error.message}`)
        }
      } else {
        core.warning(
          `${prefixLabel}: An unexpected error occurred. Please try again later.`
        )
        core.debug(`Original error: ${error.toString()}`)
      }

      return {
        status: 'failed',
        error: 'Status check failed',
        processTracking: undefined
      }
    })
}

/**
 * Format elapsed time in a human-readable way
 */
function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export async function pollStatusUntilComplete(
  getStatusFunc: () => Promise<{ status: string; [key: string]: any }>,
  maxRetries = 15,
  delay = 3000
): Promise<any | null> {
  const startTime = Date.now()

  for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
    const elapsedStr = formatElapsedTime(elapsedSeconds)

    // Create collapsible group for each poll iteration
    core.startGroup(`Status Update #${retryCount + 1} (${elapsedStr} elapsed)`)
    core.debug(`Status check attempt ${retryCount + 1}/${maxRetries}`)

    try {
      const statusData = await getStatusFunc()

      core.debug(`Status response data: ${JSON.stringify(statusData)}`)
      if (statusData.status === 'completed') {
        core.info('Processing completed successfully!')
        core.endGroup()
        return statusData
      } else if (statusData.status === 'failed') {
        core.error(
          `Processing failed: ${statusData.error}. Please review the logs for more details.`
        )
        core.endGroup()
        return null
      }
    } catch (error: any) {
      core.debug(`Status check attempt failed. Retrying...`)
      core.debug(`Original status error: ${error.message || error}`)
    }

    core.debug(`Still processing, waiting ${delay / 1000} seconds...`)
    core.endGroup()

    await new Promise((res) => setTimeout(res, delay))
  }

  core.warning(
    `Processing timed out after ${maxRetries} attempts. The analysis may still be running on the server.`
  )
  return null
}

/**
 * Finalize a run and retrieve the summary.
 * This triggers on-demand summary computation on the backend and returns the results.
 * Used to ensure summary data is available when the action exits (timeout, completion, or failure).
 *
 * @param runId The run ID to finalize
 * @returns The run summary if available, null otherwise
 */
export async function finalizeRun(runId: string): Promise<RunSummary | null> {
  const apiUrl = getApiUrl()
  const token = await getIdToken(apiUrl)
  const url = `${apiUrl}/api-product/runs/${runId}/compute-summary`
  const prefixLabel = `[${LogLabels.RUN_FINALIZE}]`

  core.debug(`Calling finalize API: POST ${url}`)

  const setup = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    timeout: 30000
  }

  try {
    const response = await axios.post(url, {}, setup)
    const parsed = RunSummarySchema.safeParse(response.data)

    if (!parsed.success) {
      core.warning(
        `${prefixLabel}: Received unexpected response format from finalize API`
      )
      core.debug(`Parse error: ${parsed.error.message}`)
      return null
    }

    const summary = parsed.data
    core.info(`${prefixLabel}: Summary computed successfully`)
    logSummary(summary)
    return summary
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        core.warning(`${prefixLabel}: Request timed out`)
      } else if (error.response?.status === 404) {
        core.warning(
          `${prefixLabel}: Run not found or finalize endpoint not available`
        )
      } else {
        core.warning(
          `${prefixLabel}: Could not compute summary: ${error.message}`
        )
      }
    } else {
      core.warning(`${prefixLabel}: Could not compute summary`)
      core.debug(`Original error: ${error}`)
    }
    return null
  }
}
