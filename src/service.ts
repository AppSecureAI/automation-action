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
  RunSummarySchema,
  QuotaErrorDetailSchema,
  StructuredErrorDetailSchema
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
  getAutoCreatePrs,
  getCreateIssuesForIncompleteRemediations,
  getCommentModificationMode,
  getGroupingEnabled,
  getGroupingStrategy,
  getMaxVulnerabilitiesPerPr,
  getGroupingStage,
  getUpdateContext
} from './input.js'
import {
  SubmitRunOutput,
  StructuredErrorDetail,
  PlanErrorCode,
  RunSummary,
  ParsedApiError,
  QuotaErrorDetail,
  StatusResult
} from './types.js'
import store from './store.js'
import { logSteps, logProcessTracking, logSummary } from './utils.js'
import {
  LogLabels,
  BILLING_URL,
  SUPPORT_EMAIL,
  STATUS_PAGE_URL,
  PollingConfig
} from './constants.js'

const API_TIMEOUT = 8 * 60 * 1000

/**
 * Check whether an axios error is retriable (transient network or server error).
 * Retries on network errors (timeout, connection reset) and HTTP 5xx responses.
 * Does NOT retry on 4xx or successful responses with error payloads.
 */
function isRetriableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  // Network errors without a response (timeout, connection reset, DNS)
  if (!error.response) return true
  // Server errors from load balancer / upstream
  const status = error.response.status
  return status >= 500
}

/**
 * Execute an async function with exponential backoff retry on transient errors.
 *
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in ms before exponential backoff (default: 1000)
 * @returns The result of the function
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries || !isRetriableError(error)) {
        throw error
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt)
      core.debug(
        `Retriable error on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delayMs}ms...`
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: unreachable')
}

/**
 * Parse an axios error response into a structured ParsedApiError object.
 * Extracts HTTP status code, error codes, and detailed information from the response body.
 *
 * @param error - The axios error object
 * @returns ParsedApiError with extracted details, or null if not an axios error
 */
export function parseApiError(error: unknown): ParsedApiError | null {
  if (!axios.isAxiosError(error)) {
    return null
  }

  const statusCode = error.response?.status ?? 0
  const responseData = error.response?.data

  // Default error with status code
  const parsedError: ParsedApiError = {
    statusCode,
    message: error.message || 'An unexpected error occurred',
    rawError: error.message
  }

  if (!responseData) {
    return parsedError
  }

  // Try to parse as quota error detail (for 429 responses)
  if (statusCode === 429) {
    const quotaParsed = QuotaErrorDetailSchema.safeParse(responseData)
    if (quotaParsed.success) {
      parsedError.quotaDetails = quotaParsed.data
      parsedError.message =
        quotaParsed.data.message ||
        quotaParsed.data.error ||
        parsedError.message
      parsedError.errorCode = PlanErrorCode.QUOTA_EXCEEDED
    }
  }

  // Try to parse as payment required error (for 402 responses)
  if (statusCode === 402) {
    parsedError.errorCode = PlanErrorCode.PAYMENT_REQUIRED
    if (typeof responseData === 'object' && responseData.message) {
      parsedError.message = responseData.message
    } else if (typeof responseData === 'object' && responseData.detail) {
      parsedError.message =
        typeof responseData.detail === 'string'
          ? responseData.detail
          : responseData.detail.description || 'Payment required'
    }
  }

  // Handle server errors (500)
  if (statusCode === 500) {
    parsedError.errorCode = PlanErrorCode.SERVER_ERROR
    if (typeof responseData === 'object' && responseData.detail) {
      parsedError.message =
        typeof responseData.detail === 'string'
          ? responseData.detail
          : responseData.detail.description || 'Internal server error'
    }
  }

  // Try to parse structured error detail from detail field
  const detail = responseData.detail
  if (typeof detail === 'object' && detail !== null) {
    const structuredParsed = StructuredErrorDetailSchema.safeParse(detail)
    if (structuredParsed.success) {
      parsedError.structuredDetails = structuredParsed.data
      if (structuredParsed.data.code) {
        parsedError.errorCode = structuredParsed.data.code
      }
      if (structuredParsed.data.description) {
        parsedError.message = structuredParsed.data.description
      }
    }
  } else if (typeof detail === 'string') {
    parsedError.message = detail
  }

  return parsedError
}

/**
 * Format a user-friendly error message based on the parsed API error.
 * Provides specific guidance for quota (429), payment (402), and server (500) errors.
 *
 * @param error - The parsed API error
 * @param prefixLabel - Label prefix for the error message (e.g., "[Submit Analysis for Processing]")
 * @returns Formatted error message string
 */
export function formatErrorMessage(
  error: ParsedApiError,
  prefixLabel: string
): string {
  const { statusCode, errorCode, message, quotaDetails, structuredDetails } =
    error

  // Handle quota exceeded (429)
  if (statusCode === 429) {
    return formatQuotaExceededError(quotaDetails, prefixLabel)
  }

  // Handle payment required (402)
  if (statusCode === 402) {
    return formatPaymentRequiredError(message, prefixLabel)
  }

  // Handle server error (500)
  if (statusCode === 500) {
    return formatServerError(message, prefixLabel)
  }

  // Handle structured errors with error codes
  if (errorCode && structuredDetails) {
    return formatStructuredError(errorCode, structuredDetails, prefixLabel)
  }

  // Default error format
  return `${prefixLabel} ${message}`
}

/**
 * Format a quota exceeded error message with usage details and upgrade guidance.
 */
function formatQuotaExceededError(
  quotaDetails: QuotaErrorDetail | undefined,
  prefixLabel: string
): string {
  const lines: string[] = []

  lines.push(`${prefixLabel} QUOTA EXCEEDED`)
  lines.push(
    'Your organization has reached its run limit for this billing period.'
  )
  lines.push('')

  if (quotaDetails) {
    const used = quotaDetails.quota_used ?? 'N/A'
    const limit = quotaDetails.quota_limit ?? 'N/A'
    lines.push(`Current Usage: ${used} runs used / ${limit} runs available`)

    if (quotaDetails.period_start && quotaDetails.period_end) {
      lines.push(
        `Period: ${quotaDetails.period_start} to ${quotaDetails.period_end}`
      )
    }
    lines.push('')
  }

  lines.push('To resolve:')
  lines.push(`- Upgrade your plan at ${BILLING_URL}`)
  lines.push(`- Contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format a payment required error message with billing guidance.
 */
function formatPaymentRequiredError(
  message: string,
  prefixLabel: string
): string {
  const lines: string[] = []

  lines.push(`${prefixLabel} PAYMENT REQUIRED`)
  lines.push(message || 'A payment is required to continue using this service.')
  lines.push('')
  lines.push('To resolve:')
  lines.push(`- Update your payment method at ${BILLING_URL}`)
  lines.push(`- Contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format a server error message with retry guidance.
 */
function formatServerError(message: string, prefixLabel: string): string {
  const lines: string[] = []

  lines.push(`${prefixLabel} SERVER ERROR`)
  lines.push(message || 'An internal server error occurred.')
  lines.push('')
  lines.push('To resolve:')
  lines.push('- Wait a few minutes and retry your request')
  lines.push(`- Check ${STATUS_PAGE_URL} for service status`)
  lines.push(`- If the problem persists, contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format a structured error message with error code context.
 */
function formatStructuredError(
  errorCode: string,
  details: StructuredErrorDetail,
  prefixLabel: string
): string {
  const description =
    details.description ?? 'An error occurred. Please try again.'
  return `${prefixLabel} [${errorCode}] ${description}`
}

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

  // Add flag for creating issues instead of PRs for incomplete remediations
  formData.append(
    'create_issues_for_incomplete_remediations',
    String(getCreateIssuesForIncompleteRemediations())
  )

  // Add comment modification mode
  formData.append('comment_modification_mode', getCommentModificationMode())

  // Add grouping configuration parameters
  const groupingEnabled = getGroupingEnabled()
  formData.append('grouping_enabled', String(groupingEnabled))
  if (groupingEnabled) {
    formData.append('grouping_strategy', getGroupingStrategy())
    formData.append(
      'max_vulnerabilities_per_pr',
      String(getMaxVulnerabilitiesPerPr())
    )
    formData.append('grouping_stage', getGroupingStage())
  }

  // Add update-context flag to trigger fresh security context extraction
  const updateContext = getUpdateContext()
  formData.append('update_context', String(updateContext))
  if (updateContext) {
    core.info('Security context update requested')
  }

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

      // Try to parse as structured API error for better messaging
      const parsedError = parseApiError(error)

      if (parsedError) {
        // Handle special status codes with formatted messages
        if ([429, 402, 500].includes(parsedError.statusCode)) {
          errorMessage = formatErrorMessage(parsedError, prefixLabel)

          // Log additional debug context for quota errors
          if (parsedError.statusCode === 429 && parsedError.quotaDetails) {
            const qd = parsedError.quotaDetails
            core.debug(`Quota used: ${qd.quota_used}`)
            core.debug(`Quota limit: ${qd.quota_limit}`)
            if (qd.period_start) core.debug(`Period start: ${qd.period_start}`)
            if (qd.period_end) core.debug(`Period end: ${qd.period_end}`)
          }
        } else if (axios.isAxiosError(error)) {
          // Handle other axios errors
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
                core.debug(
                  `Organization ID: ${structuredDetail.organization_id}`
                )
              }
              if (structuredDetail.expires_at) {
                core.debug(`Plan expires at: ${structuredDetail.expires_at}`)
              }
              if (structuredDetail.status) {
                core.debug(`Plan status: ${structuredDetail.status}`)
              }
              if (structuredDetail.owner) {
                core.debug(`Owner: ${structuredDetail.owner}`)
              }
              if (structuredDetail.owner_type) {
                core.debug(`Owner type: ${structuredDetail.owner_type}`)
              }
            }

            // Handle step list if present (works with both formats)
            if (apiDetail?.steps) {
              const stepList = StepListSchema.safeParse(apiDetail.steps)
              if (stepList.success) {
                logSteps(stepList.data, LogLabels.RUN_SUBMIT)
              }
            }
          } else {
            errorMessage = `${prefixLabel} Call failed: ${error.message}`
          }
        }
      } else if (axios.isAxiosError(error)) {
        // Non-parsed axios error (e.g., timeout without response)
        if (error.code === 'ECONNABORTED') {
          errorMessage = `${prefixLabel} Call failed: Request timed out. Please try again later.`
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
    timeout: PollingConfig.STATUS_TIMEOUT_MS
  }

  return fetchWithRetry(() => axios.get(url, setup), 2, 500)
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
      const runStatus = parsedResponse.data.run_status
      let totalVulns = 0

      // Log process tracking information if available (Issue #181)
      if (processTracking) {
        logProcessTracking(processTracking, prefixLabel)
      }

      // Check run-level status first (canonical source of truth)
      // The run's top-level status is the authoritative indicator of run state
      if (runStatus === 'failed') {
        const errorMsg =
          processTracking?.overall_status?.error_message ||
          processTracking?.find_status?.error_message ||
          'Run failed'
        core.error(`${prefixLabel}: Run failed - ${errorMsg}`)
        return { status: 'failed', error: errorMsg, processTracking, summary }
      }

      if (runStatus === 'completed') {
        core.info(`${prefixLabel}: Run completed successfully`)
        return { status: 'completed', processTracking, summary }
      }

      if (runStatus === 'cancelled') {
        core.warning(`${prefixLabel}: Run was cancelled`)
        return {
          status: 'failed',
          error: 'Run was cancelled',
          processTracking,
          summary
        }
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

      // Fallback: Check overall_status for backward compatibility with older API responses
      // that may not include run_status
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

      // Fallback: Check for individual stage failures (Issue #233)
      // This provides granular error messages when run_status isn't available
      if (processTracking) {
        // Check find stage failure
        if (processTracking.find_status?.status === 'failed') {
          const errorMsg =
            processTracking.find_status.error_message ||
            'Vulnerability import failed'
          core.error(`${prefixLabel}: Find stage failed - ${errorMsg}`)
          return { status: 'failed', error: errorMsg, processTracking, summary }
        }

        // Check triage stage failure
        if (processTracking.triage_status?.status === 'failed') {
          const errorMsg =
            processTracking.triage_status.error_message ||
            'Triage analysis failed'
          core.error(`${prefixLabel}: Triage stage failed - ${errorMsg}`)
          return { status: 'failed', error: errorMsg, processTracking, summary }
        }

        // Check remediation loop failure
        if (
          processTracking.remediation_validation_loop_status?.status ===
          'failed'
        ) {
          const errorMsg =
            processTracking.remediation_validation_loop_status.error_message ||
            'Remediation failed'
          core.error(`${prefixLabel}: Remediation stage failed - ${errorMsg}`)
          return { status: 'failed', error: errorMsg, processTracking, summary }
        }

        // Check push stage failure
        if (processTracking.push_status?.status === 'failed') {
          const errorMsg =
            processTracking.push_status.error_message ||
            'Pull request creation failed'
          core.error(`${prefixLabel}: Push stage failed - ${errorMsg}`)
          return { status: 'failed', error: errorMsg, processTracking, summary }
        }
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
        status: 'network_error',
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

export const MAX_CONSECUTIVE_NETWORK_ERRORS = 3

export async function pollStatusUntilComplete(
  getStatusFunc: () => Promise<StatusResult>,
  maxRetries = 15,
  delay = 3000
): Promise<StatusResult | null> {
  const startTime = Date.now()
  let consecutiveNetworkErrors = 0

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
      } else if (statusData.status === 'network_error') {
        consecutiveNetworkErrors++
        core.warning(
          `Status check network error (${consecutiveNetworkErrors}/${MAX_CONSECUTIVE_NETWORK_ERRORS}). ` +
            `Server may still be processing. Retrying...`
        )
        if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
          core.error(
            `Status check failed after ${MAX_CONSECUTIVE_NETWORK_ERRORS} consecutive network errors. ` +
              `The server may be unreachable.`
          )
          core.endGroup()
          return null
        }
      } else {
        // Successful non-terminal response resets the counter
        consecutiveNetworkErrors = 0
      }
    } catch (error: unknown) {
      core.debug(`Status check attempt failed. Retrying...`)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      core.debug(`Original status error: ${errorMessage}`)
    }

    core.debug(`Still processing, waiting ${delay / 1000} seconds...`)
    core.endGroup()

    await new Promise((res) => setTimeout(res, delay))
  }

  core.warning(
    `Processing timed out after ${maxRetries} attempts. The analysis may still be running on the server. ` +
      `Monitor your repository for new pull requests and check the AppSecAI dashboard for run status and results.`
  )
  return null
}

/**
 * Configuration options for finalizeRun retry behavior.
 */
export interface FinalizeRunOptions {
  /** Expected number of PRs to be present in the summary. If provided, will retry until count matches. */
  expectedPrCount?: number
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Delay between retries in milliseconds (default: 2000) */
  retryDelay?: number
}

/**
 * Delay execution for the specified number of milliseconds.
 * Extracted for testability.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Finalize a run and retrieve the summary.
 * This triggers on-demand summary computation on the backend and returns the results.
 * Used to ensure summary data is available when the action exits (timeout, completion, or failure).
 *
 * When expectedPrCount is provided, the function will retry if the summary's pr_count
 * is less than expected, giving time for all PRs to be persisted to the database.
 *
 * @param runId The run ID to finalize
 * @param options Optional configuration for retry behavior
 * @returns The run summary if available, null otherwise
 */
export async function finalizeRun(
  runId: string,
  options: FinalizeRunOptions = {}
): Promise<RunSummary | null> {
  const { expectedPrCount, maxRetries = 3, retryDelay = 2000 } = options
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

  let lastSummary: RunSummary | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    core.debug(`${prefixLabel}: Finalize attempt ${attempt}/${maxRetries}`)

    try {
      const response = await axios.post(url, {}, setup)
      const parsed = RunSummarySchema.safeParse(response.data)

      if (!parsed.success) {
        core.warning(
          `${prefixLabel}: Received unexpected response format from finalize API`
        )
        core.debug(`Parse error: ${parsed.error.message}`)
        // Continue retrying on parse errors
        if (attempt < maxRetries) {
          await delay(retryDelay)
          continue
        }
        return lastSummary
      }

      const summary = parsed.data
      lastSummary = summary

      // If we have an expected count, verify it matches
      if (expectedPrCount !== undefined && summary.pr_count < expectedPrCount) {
        core.info(
          `${prefixLabel}: Summary shows ${summary.pr_count} PRs, expected ${expectedPrCount}. ` +
            `Retrying in ${retryDelay}ms... (attempt ${attempt}/${maxRetries})`
        )
        if (attempt < maxRetries) {
          await delay(retryDelay)
          continue
        }
        // Last attempt - return best available summary
        core.warning(
          `${prefixLabel}: Could not get complete summary after ${maxRetries} attempts. ` +
            `Returning summary with ${summary.pr_count} PRs (expected ${expectedPrCount}).`
        )
        logSummary(summary)
        return summary
      }

      // Success - count matches or no expected count provided
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
          // Don't retry on 404 - the endpoint isn't available
          return lastSummary
        } else {
          core.warning(
            `${prefixLabel}: Could not compute summary: ${error.message}`
          )
        }
      } else {
        core.warning(`${prefixLabel}: Could not compute summary`)
        core.debug(`Original error: ${error}`)
      }

      // Retry on transient errors
      if (attempt < maxRetries) {
        core.debug(`${prefixLabel}: Retrying after error...`)
        await delay(retryDelay)
        continue
      }

      return lastSummary
    }
  }

  return lastSummary
}
