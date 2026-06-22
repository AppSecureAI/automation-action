// src/service.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import axios from 'axios'
import {
  createAppSecAIRuntime,
  type SubmitPayloadOptions
} from './common/core/index.js'
export { fetchWithRetry } from './common/core/index.js'
import {
  RunResponseSchema,
  ResponseStatusSchema,
  StepListSchema,
  RunSummarySchema,
  QuotaErrorDetailSchema,
  StructuredErrorDetailSchema,
  RepoAccessErrorDetailSchema
} from './schemas.js'
import { getIdToken } from './github.js'
import {
  getApiUrl,
  getMode,
  getAutoCreatePrs,
  getCreateIssuesForIncompleteRemediations,
  getCommentModificationMode,
  getGroupingStage,
  getGroupingStrategy,
  getLlmProfile,
  getExperiment,
  getMaxVulnerabilitiesPerPr,
  isGroupingStageConfigured,
  isGroupingStrategyConfigured,
  isMaxVulnerabilitiesPerPrConfigured,
  getPrAudience,
  getGroupingEnabled,
  getUpdateContext,
  getAllowMissingRepoAccess
} from './input.js'
import type { SastInputFile } from './file.js'
import {
  SubmitRunOutput,
  StructuredErrorDetail,
  PlanErrorCode,
  RunSummary,
  ParsedApiError,
  QuotaErrorDetail,
  StatusResult,
  ProcessStatus,
  RunProcessTracking
} from './types.js'
import store from './store.js'
import { logSteps, logProcessTracking, logSummary } from './utils.js'
import {
  LogLabels,
  SUPPORT_EMAIL,
  APP_INSTALL_URL,
  PollingConfig,
  REPO_ACCESS_MISSING_CODE
} from './constants.js'

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

  // Try to parse as quota error detail (for 429 responses). 429 may carry
  // usage at the top level (legacy) or nested in `detail` (envelope). Only
  // adopt the top-level shape when it actually carries usage numbers, so an
  // empty match does not preempt the structured-detail block below (which
  // would otherwise leave quotaDetails an empty object and drop the numbers).
  if (statusCode === 429) {
    const quotaParsed = QuotaErrorDetailSchema.safeParse(responseData)
    if (
      quotaParsed.success &&
      (quotaParsed.data.quota_used !== undefined ||
        quotaParsed.data.quota_limit !== undefined)
    ) {
      parsedError.quotaDetails = quotaParsed.data
      parsedError.message =
        quotaParsed.data.message ||
        quotaParsed.data.error ||
        parsedError.message
      parsedError.errorCode = PlanErrorCode.QUOTA_EXCEEDED
    } else if (quotaParsed.success) {
      // No usage numbers but the legacy message/error fields may still be the
      // best available message, and the code is still QUOTA_EXCEEDED for 429.
      parsedError.message =
        quotaParsed.data.message ||
        quotaParsed.data.error ||
        parsedError.message
      parsedError.errorCode = PlanErrorCode.QUOTA_EXCEEDED
    }
  }

  // Try to parse as payment required error (for 402 responses). This is the
  // default code; the structured-detail block below may override it with the
  // flat code carried in `detail.code` (QUOTA_EXCEEDED / NO_PLAN_ASSIGNED /
  // PLAN_EXPIRED / PLAN_INACTIVE / PAYMENT_REQUIRED).
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

  // Try to parse structured error detail from the detail field. This is the
  // authoritative source for plan/quota/entitlement denials (flat-code 402/403
  // shape and the future ENTITLEMENT_DENIED envelope). Runs last so the
  // structured code/description/remediation override the status-based defaults
  // set above.
  const detail = responseData.detail
  if (typeof detail === 'object' && detail !== null) {
    const structuredParsed = StructuredErrorDetailSchema.safeParse(detail)
    if (structuredParsed.success) {
      const sd = structuredParsed.data
      parsedError.structuredDetails = sd

      // Resolve the effective error code. For the future ENTITLEMENT_DENIED
      // envelope, map reason_code to a canonical plan/quota code so a single
      // set of renderers serves both contracts; otherwise use the flat code.
      const envelopeCode =
        sd.code === ENTITLEMENT_DENIED_CODE
          ? reasonCodeToPlanCode(sd.reason_code)
          : undefined
      const effectiveCode = envelopeCode ?? sd.code
      if (effectiveCode) {
        parsedError.errorCode = effectiveCode
      }

      // Body line precedence: server description, then envelope remediation.
      if (sd.description) {
        parsedError.message = sd.description
      } else if (sd.remediation) {
        parsedError.message = sd.remediation
      }

      // Populate quota usage from a flat-code 402 quota denial (or any detail
      // carrying usage) so the QUOTA EXCEEDED usage block can render.
      if (
        !parsedError.quotaDetails &&
        (sd.quota_used !== undefined || sd.quota_limit !== undefined)
      ) {
        parsedError.quotaDetails = {
          quota_used: sd.quota_used,
          quota_limit: sd.quota_limit,
          period_start: sd.period_start,
          period_end: sd.period_end
        }
      }
    }
  } else if (typeof detail === 'string') {
    parsedError.message = detail
  }

  return parsedError
}

/**
 * Code used by the future ENTITLEMENT_DENIED envelope contract. When the
 * structured detail carries this code, the actionable reason is in
 * `reason_code` and the guidance in `remediation`.
 */
const ENTITLEMENT_DENIED_CODE = 'ENTITLEMENT_DENIED'

/**
 * Map an ENTITLEMENT_DENIED envelope reason_code to the canonical flat
 * plan/quota code so a single set of renderers can serve both contracts.
 */
function reasonCodeToPlanCode(reasonCode?: string): string | undefined {
  switch (reasonCode) {
    case 'no_plan':
      return PlanErrorCode.NO_PLAN_ASSIGNED
    case 'plan_inactive':
      return PlanErrorCode.PLAN_INACTIVE
    case 'quota_exceeded':
      return PlanErrorCode.QUOTA_EXCEEDED
    case 'invite_required':
      return ONBOARDING_CODE
    default:
      return undefined
  }
}

/**
 * Canonical code for the onboarding/invite-required denial (maps from the
 * envelope reason_code `invite_required`).
 */
const ONBOARDING_CODE = 'ONBOARDING_REQUIRED'

/**
 * Determine whether a message returned by the server (or axios) is specific
 * enough to surface to the user as-is.
 *
 * Axios's default failure messages ("Request failed with status code 403"),
 * bare HTTP reason phrases ("Forbidden"), and generic placeholders
 * ("An error occurred...") carry no actionable context, so callers should
 * substitute mapped, status-specific guidance instead of echoing them.
 *
 * @param message - The candidate message text
 * @returns true if the message is specific/actionable, false otherwise
 */
export function isActionableServerMessage(
  message: string | undefined
): boolean {
  if (!message) return false
  const trimmed = message.trim()
  if (trimmed === '') return false
  // Axios default network/HTTP error messages
  if (/^Request failed with status code \d+/i.test(trimmed)) return false
  // Generic placeholders that imply nothing actionable
  if (/^An (unexpected )?error occurred/i.test(trimmed)) return false
  // Bare HTTP reason phrases provide no detail beyond the status code
  const bareReasons = new Set([
    'forbidden',
    'unauthorized',
    'not found',
    'bad request',
    'payment required',
    'unprocessable entity',
    'internal server error',
    'request timeout'
  ])
  if (bareReasons.has(trimmed.toLowerCase())) return false
  return true
}

/**
 * Format a user-friendly, actionable error message based on the parsed API error.
 *
 * Dispatches on HTTP status code so every documented failure path (401, 402,
 * 403, 404, 408, 422, 429, 5xx) produces clear guidance. Non-retriable
 * authorization/validation failures never instruct the user to "try again".
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

  switch (statusCode) {
    case 401:
      return formatAuthenticationError(message, prefixLabel)
    case 402:
      // The submit channel returns ALL plan/quota/billing denials at HTTP 402
      // with a flat structured code. Branch on that code so each denial gets an
      // accurate header and tailored guidance instead of a blanket
      // "PAYMENT REQUIRED".
      return formatPaymentRequiredFamily(
        errorCode,
        message,
        quotaDetails,
        prefixLabel
      )
    case 403:
      return formatAuthorizationError(message, errorCode, prefixLabel)
    case 404:
      return formatNotFoundError(message, prefixLabel)
    case 408:
      return formatRequestTimeoutError(message, prefixLabel)
    case 422:
      return formatValidationError(message, prefixLabel)
    case 429:
      return formatQuotaExceededError(quotaDetails, prefixLabel)
  }

  // Handle server errors (500 and other 5xx)
  if (statusCode >= 500) {
    return formatServerError(message, prefixLabel)
  }

  // Handle structured errors with error codes (e.g., 400 with a plan code)
  if (errorCode && structuredDetails) {
    return formatStructuredError(errorCode, structuredDetails, prefixLabel)
  }

  // Default error format
  return `${prefixLabel} ${message}`
}

/**
 * Dispatch an HTTP 402 (and envelope-mapped) denial to the correct renderer
 * based on the flat structured code. The submit channel returns every
 * plan/quota/billing denial at 402, so a blanket "PAYMENT REQUIRED" would
 * mislabel a quota exhaustion as a billing problem and drop its usage numbers.
 *
 * Routing:
 * - QUOTA_EXCEEDED -> formatQuotaExceededError (labeled QUOTA EXCEEDED, usage)
 * - NO_PLAN_ASSIGNED / PLAN_EXPIRED / PLAN_INACTIVE / ONBOARDING_REQUIRED ->
 *   formatAuthorizationError ([<CODE>] ACCESS DENIED + plan-specific guidance)
 * - PAYMENT_REQUIRED / unknown / absent -> formatPaymentRequiredError
 */
function formatPaymentRequiredFamily(
  errorCode: string | undefined,
  message: string,
  quotaDetails: QuotaErrorDetail | undefined,
  prefixLabel: string
): string {
  switch (errorCode) {
    case PlanErrorCode.QUOTA_EXCEEDED:
      return formatQuotaExceededError(quotaDetails, prefixLabel)
    case PlanErrorCode.NO_PLAN_ASSIGNED:
    case PlanErrorCode.PLAN_EXPIRED:
    case PlanErrorCode.PLAN_INACTIVE:
    case ONBOARDING_CODE:
      return formatAuthorizationError(message, errorCode, prefixLabel)
    default:
      return formatPaymentRequiredError(message, prefixLabel)
  }
}

/**
 * Format an authentication failure (HTTP 401) with actionable guidance.
 * This is a non-retriable error; the message never instructs the user to retry.
 */
function formatAuthenticationError(
  message: string,
  prefixLabel: string
): string {
  const detail = isActionableServerMessage(message)
    ? message.trim()
    : 'Your request could not be authenticated.'

  const lines: string[] = []
  lines.push(`${prefixLabel} AUTHENTICATION FAILED`)
  lines.push(detail)
  lines.push('')
  lines.push('This is not a transient error and will not be fixed by retrying.')
  lines.push('To resolve:')
  lines.push(
    `- Verify the AppSecAI GitHub App is installed on this repository: ${APP_INSTALL_URL}`
  )
  lines.push(
    "- Ensure the workflow grants 'id-token: write' permission for OIDC authentication"
  )
  lines.push('- Confirm your AppSecAI account is active')
  lines.push(`- Contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format an authorization / plan denial (HTTP 403) with actionable guidance.
 *
 * Surfaces the server-provided detail when present; otherwise maps the known
 * plan/authorization error codes to specific guidance. Never instructs the user
 * to "try again" because these denials are permanent until access is granted.
 */
function formatAuthorizationError(
  message: string,
  errorCode: string | undefined,
  prefixLabel: string
): string {
  const codeLabel =
    errorCode && errorCode !== PlanErrorCode.UNKNOWN ? ` [${errorCode}]` : ''

  // Per-code detail (the second line). The server description is always
  // preferred when it is specific enough to surface.
  const serverDetail = isActionableServerMessage(message)
    ? message.trim()
    : undefined

  let detail: string
  switch (errorCode) {
    case PlanErrorCode.NO_PLAN_ASSIGNED:
      detail =
        serverDetail || 'No subscription plan is assigned to your organization.'
      break
    case PlanErrorCode.PLAN_EXPIRED:
      detail = serverDetail || "Your organization's plan has expired."
      break
    case PlanErrorCode.PLAN_INACTIVE:
      detail = serverDetail || "Your organization's plan is not active."
      break
    case ONBOARDING_CODE:
      detail =
        serverDetail || 'Onboarding is required before you can submit runs.'
      break
    case PlanErrorCode.NO_ELIGIBLE_ORG:
      detail =
        serverDetail ||
        'Your organization does not have an active plan or the access required to run AppSecAI. ' +
          'Contact your AppSecAI representative.'
      break
    case PlanErrorCode.PERSONAL_ACCOUNT_NOT_SUPPORTED:
      detail =
        serverDetail ||
        'Personal GitHub accounts are not supported. ' +
          'Run AppSecAI under a GitHub organization that has an active plan.'
      break
    default:
      detail =
        serverDetail ||
        'Your request was not authorized. This usually means your organization does not have ' +
          'an active plan or the access required to run AppSecAI. Contact your AppSecAI representative.'
  }

  // Per-code resolution lines. NO_PLAN_ASSIGNED / PLAN_EXPIRED / PLAN_INACTIVE /
  // ONBOARDING_REQUIRED get distinct, specific guidance; all other codes keep
  // the established generic plan/access guidance.
  let resolutionLines: string[]
  switch (errorCode) {
    case PlanErrorCode.NO_PLAN_ASSIGNED:
      resolutionLines = [
        "- Assign a plan to your organization (ask your admin if you don't manage billing).",
        `- Contact your AppSecAI representative or support: ${SUPPORT_EMAIL}`
      ]
      break
    case PlanErrorCode.PLAN_EXPIRED:
      resolutionLines = [
        "- Renew your organization's plan.",
        `- Contact your AppSecAI representative or support: ${SUPPORT_EMAIL}`
      ]
      break
    case PlanErrorCode.PLAN_INACTIVE:
      resolutionLines = [
        '- Ask your organization admin to reactivate the plan.',
        `- Contact your AppSecAI representative or support: ${SUPPORT_EMAIL}`
      ]
      break
    case ONBOARDING_CODE:
      resolutionLines = [
        '- Complete onboarding / redeem your invite code.',
        `- Contact your AppSecAI representative or support: ${SUPPORT_EMAIL}`
      ]
      break
    default:
      resolutionLines = [
        '- Verify your organization has an active AppSecAI plan and access',
        `- Contact your AppSecAI representative or support: ${SUPPORT_EMAIL}`
      ]
  }

  const lines: string[] = []
  lines.push(`${prefixLabel}${codeLabel} ACCESS DENIED`)
  lines.push(detail)
  lines.push('')
  lines.push('This is not a transient error and will not be fixed by retrying.')
  lines.push('To resolve:')
  lines.push(...resolutionLines)

  return lines.join('\n')
}

/**
 * Format a not-found error (HTTP 404) with actionable guidance.
 */
function formatNotFoundError(message: string, prefixLabel: string): string {
  const detail = isActionableServerMessage(message)
    ? message.trim()
    : 'The requested resource was not found.'

  const lines: string[] = []
  lines.push(`${prefixLabel} NOT FOUND`)
  lines.push(detail)
  lines.push('')
  lines.push('To resolve:')
  lines.push(
    "- Verify the 'api-url' input points to the correct AppSecAI endpoint"
  )
  lines.push(
    `- Confirm the AppSecAI GitHub App is installed on this repository: ${APP_INSTALL_URL}`
  )
  lines.push(`- Contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format a server-side request timeout (HTTP 408). This condition is transient,
 * so retry guidance is appropriate here.
 */
function formatRequestTimeoutError(
  message: string,
  prefixLabel: string
): string {
  const detail = isActionableServerMessage(message)
    ? message.trim()
    : 'The server took too long to respond.'

  const lines: string[] = []
  lines.push(`${prefixLabel} REQUEST TIMEOUT`)
  lines.push(detail)
  lines.push('')
  lines.push('This is usually transient. To resolve:')
  lines.push('- Wait a few minutes and retry your request')
  lines.push(`- If the problem persists, contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format a validation error (HTTP 422) with actionable guidance.
 * Non-retriable: the submission must be corrected before resubmitting.
 */
function formatValidationError(message: string, prefixLabel: string): string {
  const detail = isActionableServerMessage(message)
    ? message.trim()
    : 'The submitted analysis results were rejected as invalid.'

  const lines: string[] = []
  lines.push(`${prefixLabel} INVALID SUBMISSION`)
  lines.push(detail)
  lines.push('')
  lines.push('This is not a transient error and will not be fixed by retrying.')
  lines.push('To resolve:')
  lines.push(
    '- Verify your analysis file is valid JSON/SARIF and follows the expected schema'
  )
  lines.push('- Ensure the file is not empty and is within the size limit')
  lines.push(`- Contact support: ${SUPPORT_EMAIL} if the file appears valid`)

  return lines.join('\n')
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

  // Only render the usage line when BOTH numbers are present. Printing
  // "N/A runs used / N/A runs available" from a partial/empty detail is
  // noise, so it is suppressed entirely.
  if (
    quotaDetails &&
    quotaDetails.quota_used !== undefined &&
    quotaDetails.quota_limit !== undefined
  ) {
    lines.push(
      `Current Usage: ${quotaDetails.quota_used} runs used / ${quotaDetails.quota_limit} runs available`
    )

    if (quotaDetails.period_start && quotaDetails.period_end) {
      lines.push(
        `Period: ${quotaDetails.period_start} to ${quotaDetails.period_end}`
      )
    }
    lines.push('')
  }

  lines.push('To resolve:')
  lines.push(
    '- Contact your AppSecAI representative to upgrade or renew your plan'
  )
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
  lines.push(
    '- Contact your AppSecAI representative to upgrade or renew your plan'
  )
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
  lines.push(`- If the problem persists, contact support: ${SUPPORT_EMAIL}`)

  return lines.join('\n')
}

/**
 * Format a structured error message with error code context.
 *
 * Used for structured errors that don't map to a dedicated HTTP-status handler.
 * When the server omits a description, falls back to neutral, support-oriented
 * guidance rather than a misleading "please try again" (the condition may be
 * permanent).
 */
function formatStructuredError(
  errorCode: string,
  details: StructuredErrorDetail,
  prefixLabel: string
): string {
  const description =
    details.description && details.description.trim() !== ''
      ? details.description
      : `The request could not be completed. Contact support: ${SUPPORT_EMAIL} if this persists.`
  return `${prefixLabel} [${errorCode}] ${description}`
}

/**
 * Build the fail-fast error message for the Hydra repo-access pre-flight
 * rejection (HTTP 403, code `github_app_repo_access_missing`).
 *
 * Surfaces Hydra's ready-to-display `detail.message` verbatim, framed so it
 * does not read like a generic network/server error, and points users at the
 * `allow-missing-repo-access` override for the licensed-org / repo-not-yet-added
 * case.
 *
 * @param error - The axios error from the submit call
 * @param prefixLabel - Label prefix for the message (e.g. "[Submit Analysis for Processing]")
 * @returns The formatted message string, or null if this is not a repo-access rejection
 */
export function formatRepoAccessError(
  error: unknown,
  prefixLabel: string
): string | null {
  if (!axios.isAxiosError(error)) {
    return null
  }
  if (error.response?.status !== 403) {
    return null
  }
  const detail = error.response?.data?.detail
  const parsed = RepoAccessErrorDetailSchema.safeParse(detail)
  if (!parsed.success || parsed.data.code !== REPO_ACCESS_MISSING_CODE) {
    return null
  }

  const data = parsed.data
  const lines: string[] = []
  lines.push(`${prefixLabel} GITHUB APP CANNOT PUSH TO THE TARGET REPOSITORY`)
  lines.push(
    'The run was not started because the AppSecAI GitHub App cannot push fixes to this repository.'
  )
  lines.push('')
  // Hydra's message is authored to be actionable and ready to display verbatim.
  lines.push(data.message)
  lines.push('')
  lines.push(
    'If the organization is licensed and the App is installed but this repository has simply not been ' +
      'added to the App yet, you can start the run now and have the fixes pushed once access is granted ' +
      'by setting the action input `allow-missing-repo-access: true`.'
  )

  // Log machine-readable context for debugging without altering the message.
  if (data.owner) core.debug(`Repo access owner: ${data.owner}`)
  if (data.repo) core.debug(`Repo access repo: ${data.repo}`)
  if (data.reason) core.debug(`Repo access reason: ${data.reason}`)
  if (data.source) core.debug(`Repo access source: ${data.source}`)

  return lines.join('\n')
}

function getActionRuntime() {
  return createAppSecAIRuntime({
    apiUrl: getApiUrl(),
    getAuthToken: getIdToken
  })
}

const ReconciliationReasonCode = {
  ACTIVE_AFTER_RUN_COMPLETED: 'RECONCILIATION_ACTIVE_AFTER_RUN_COMPLETED'
} as const

/**
 * Reason code reported when the server run is paused (a distinct, non-failure
 * outcome). A paused run preserves work and resumes automatically once
 * capacity returns (e.g. sustained Bedrock throttling), so the action stops
 * polling and reports a paused result rather than a failure.
 */
const RUN_PAUSED_REASON_CODE = 'RUN_PAUSED'

/**
 * Default human-readable message shown when a run is observed as paused and
 * the server did not provide a more specific reason.
 */
const DEFAULT_PAUSE_REASON =
  'sustained Bedrock throttling — work preserved; it will resume automatically when capacity returns'

const ACTIVE_RECONCILIATION_STATUSES = new Set([
  'initiated',
  'in_progress',
  'pending',
  'processing',
  'queued',
  'running'
])

const RECONCILIATION_STAGE_LABELS: Array<{
  key: keyof RunProcessTracking
  label: string
}> = [
  { key: 'remediation_validation_loop_status', label: 'remediation' },
  { key: 'group_remediate_status', label: 'group_remediate' },
  { key: 'group_validate_status', label: 'group_validate' },
  { key: 'push_status', label: 'push' }
]

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase()
}

function isActiveReconciliationStatus(
  status: ProcessStatus | undefined
): boolean {
  const statusName = normalizeStatus(status?.status)
  if (statusName === 'not_started') {
    return (status?.total_items ?? 0) > (status?.processed_items ?? 0)
  }
  return ACTIVE_RECONCILIATION_STATUSES.has(statusName)
}

function describeProcessStatus(label: string, status: ProcessStatus): string {
  const statusName = normalizeStatus(status.status) || 'unknown'
  const counts =
    status.total_items > 0
      ? `, processed=${status.processed_items}/${status.total_items}`
      : ''
  const successes =
    status.success_count > 0 ? `, success=${status.success_count}` : ''
  return `${label}=${statusName}${counts}${successes}`
}

function getCompletedRunReconciliationDiagnostic(
  processTracking: Partial<RunProcessTracking> | null | undefined
): { reasonCode: string; diagnostic: string } | null {
  if (!processTracking) {
    return null
  }

  const activeStages = RECONCILIATION_STAGE_LABELS.flatMap(({ key, label }) => {
    const status = processTracking[key]
    if (!status || !isActiveReconciliationStatus(status)) {
      return []
    }
    return [describeProcessStatus(label, status)]
  })

  if (activeStages.length === 0) {
    return null
  }

  return {
    reasonCode: ReconciliationReasonCode.ACTIVE_AFTER_RUN_COMPLETED,
    diagnostic:
      `run_status=completed but artifact reconciliation is still active: ${activeStages.join('; ')}. ` +
      'Continuing to poll before finalizing summary counts.'
  }
}

function isReconciliationReason(reasonCode: string | undefined): boolean {
  return reasonCode === ReconciliationReasonCode.ACTIVE_AFTER_RUN_COMPLETED
}

function buildSubmitPayloadOptions(
  mode: string,
  llmProfile?: string
): SubmitPayloadOptions {
  return {
    processingMode: mode,
    autoCreatePrs: getAutoCreatePrs(),
    createIssuesForIncompleteRemediations:
      getCreateIssuesForIncompleteRemediations(),
    commentModificationMode: getCommentModificationMode(),
    prAudience: getPrAudience() || undefined,
    llmProfile,
    maxVulnerabilitiesPerPr: isMaxVulnerabilitiesPerPrConfigured()
      ? getMaxVulnerabilitiesPerPr()
      : undefined,
    groupingStrategy: isGroupingStrategyConfigured()
      ? getGroupingStrategy()
      : undefined,
    groupingStage: isGroupingStageConfigured() ? getGroupingStage() : undefined,
    // allow_missing_repo_access overrides Hydra's pre-flight check that the
    // AppSecAI GitHub App can push to the target repository. When set, Hydra
    // starts the run even if the repo is not yet in the App installation.
    allowMissingRepoAccess: getAllowMissingRepoAccess(),
    experiment: getExperiment() || undefined
  }
}

export async function submitRun(
  file: Buffer | SastInputFile[],
  fileName?: string
): Promise<SubmitRunOutput> {
  const mode = getMode()
  const llmProfile = getLlmProfile()

  core.info(`Processing mode: ${mode}`)
  if (llmProfile) {
    core.info(`LLM profile: ${llmProfile}`)
  }

  const inputFiles = Array.isArray(file)
    ? file
    : [{ path: fileName ?? 'results.sarif', buffer: file }]
  const submitPayload = buildSubmitPayloadOptions(mode, llmProfile)

  if (getGroupingEnabled()) {
    core.debug(
      'grouping-enabled is set; grouping behavior remains inferred from processing_mode.'
    )
  }

  // update_context is not sent: unsupported by Hydra for this submit channel.
  if (getUpdateContext()) {
    core.warning(
      'update-context is set but is not supported in the current submit contract and will be ignored.'
    )
  }

  // allow_missing_repo_access is forwarded via the submit payload and
  // overrides Hydra's pre-flight check that the AppSecAI GitHub App can push
  // to the target repository.
  if (submitPayload.allowMissingRepoAccess) {
    core.warning(
      'allow-missing-repo-access is set: the run will start without verified push access for the AppSecAI GitHub App. ' +
        'Remediation pull requests will NOT be delivered until the target repository is added to the AppSecAI GitHub App installation.'
    )
  }

  core.debug('Calling submit API: POST /api-product/submit')

  const prefixLabel = `[${LogLabels.RUN_SUBMIT}]`
  core.info(
    `${prefixLabel} Submitting ${inputFiles.length} analysis result file${inputFiles.length === 1 ? '' : 's'} for processing: ${inputFiles.map((inputFile) => inputFile.path).join(', ')}`
  )

  return getActionRuntime()
    .submitRun(inputFiles, submitPayload)
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
        run_id: validData.run_id,
        organization_id: validData.organization_id
      } as SubmitRunOutput
    })
    .catch((error) => {
      // Fail fast on Hydra's repo-access pre-flight rejection (HTTP 403,
      // code github_app_repo_access_missing). Surface Hydra's actionable
      // message verbatim instead of letting it look like a generic error.
      const repoAccessMessage = formatRepoAccessError(error, prefixLabel)
      if (repoAccessMessage) {
        core.error(repoAccessMessage)
        throw new Error(repoAccessMessage)
      }

      // Default message with actionable guidance (used when we cannot classify
      // the error any more precisely).
      let errorMessage =
        `${prefixLabel} Call failed: An unexpected error occurred. ` +
        `If the issue persists, contact ${SUPPORT_EMAIL}.`

      // Try to parse as structured API error for better messaging
      const parsedError = parseApiError(error)

      if (parsedError && parsedError.statusCode > 0) {
        // We received an HTTP error response — produce an actionable,
        // status-aware message (handles 401/402/403/404/408/422/429/5xx and
        // structured plan codes). This is the single source of truth for
        // HTTP-response error formatting.
        errorMessage = formatErrorMessage(parsedError, prefixLabel)

        // Emit debug context (quota usage, plan/org metadata) for diagnostics.
        logApiErrorDebugContext(parsedError)

        // Surface any processing steps included in the error response.
        if (axios.isAxiosError(error)) {
          const apiDetail = error.response?.data?.detail
          if (
            apiDetail &&
            typeof apiDetail === 'object' &&
            'steps' in apiDetail &&
            apiDetail.steps
          ) {
            const stepList = StepListSchema.safeParse(apiDetail.steps)
            if (stepList.success) {
              logSteps(stepList.data, LogLabels.RUN_SUBMIT)
            }
          }
        }
      } else if (axios.isAxiosError(error)) {
        // No HTTP response (timeout, connection reset, DNS failure). These are
        // genuinely transient, so retry guidance is appropriate here.
        if (error.code === 'ECONNABORTED') {
          errorMessage = `${prefixLabel} Call failed: Request timed out. Please try again later.`
        } else {
          errorMessage = `${prefixLabel} Call failed: ${error.message}.`
        }
      } else {
        core.debug(`Original error: ${error.toString()}`)
      }

      core.error(errorMessage)
      throw new Error(errorMessage)
    })
}

export async function cancelRun(
  runId: string,
  organizationId: string,
  apiUrl = getApiUrl()
): Promise<void> {
  const normalizedRunId = runId.trim()
  const normalizedOrganizationId = organizationId.trim()
  if (!normalizedRunId || !normalizedOrganizationId) {
    throw new Error('runId and organizationId are required to cancel a run')
  }

  const token = await getIdToken(apiUrl)
  const url = new URL(
    `${apiUrl}/api/organizations/${encodeURIComponent(normalizedOrganizationId)}/runs/${encodeURIComponent(normalizedRunId)}/cancel`
  )
  const setup = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    timeout: PollingConfig.STATUS_TIMEOUT_MS
  }

  core.debug(`Calling cancel API: POST ${url.pathname}`)
  await axios.post(url.toString(), { reason: 'workflow_cancelled' }, setup)
  core.info(
    `[${LogLabels.RUN_STATUS}] Cancellation requested for run ${normalizedRunId}`
  )
}

/**
 * Emit debug-level diagnostic context extracted from a parsed API error.
 * Includes quota usage details (429) and plan/organization metadata
 * (structured plan errors). Never logs the message itself, which is surfaced
 * to the user via formatErrorMessage.
 */
function logApiErrorDebugContext(parsedError: ParsedApiError): void {
  const qd = parsedError.quotaDetails
  if (qd) {
    core.debug(`Quota used: ${qd.quota_used}`)
    core.debug(`Quota limit: ${qd.quota_limit}`)
    if (qd.period_start) core.debug(`Period start: ${qd.period_start}`)
    if (qd.period_end) core.debug(`Period end: ${qd.period_end}`)
  }

  const sd = parsedError.structuredDetails
  if (sd) {
    if (sd.organization_id) core.debug(`Organization ID: ${sd.organization_id}`)
    if (sd.expires_at) core.debug(`Plan expires at: ${sd.expires_at}`)
    if (sd.status) core.debug(`Plan status: ${sd.status}`)
    if (sd.owner) core.debug(`Owner: ${sd.owner}`)
    if (sd.owner_type) core.debug(`Owner type: ${sd.owner_type}`)
  }
}

export async function getStatus(
  id: string,
  organizationId?: string
): Promise<StatusResult> {
  const apiUrl = getApiUrl()
  const url = organizationId
    ? new URL(
        `${apiUrl}/api-product/organizations/${organizationId}/runs/${id}/status`
      )
    : new URL(`${apiUrl}/api-product/submit/status/${id}`)
  const prefixLabel = `[${LogLabels.RUN_STATUS}]`

  core.debug(`Calling status API: GET ${url.pathname}${url.search}`)

  return getActionRuntime()
    .getStatus(id, { organizationId })
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
      const canonicalRunStatus =
        typeof runStatus === 'string' ? normalizeStatus(runStatus) : ''
      const hasCanonicalRunStatus = canonicalRunStatus.length > 0
      const dashboardUrl = parsedResponse.data.dashboard_url
      // Reason for non-terminal run states (e.g. why a run is paused). Product
      // may send `status_reason` or `pause_reason`; fall back to `description`.
      const runStatusReason =
        parsedResponse.data.status_reason ||
        parsedResponse.data.pause_reason ||
        parsedResponse.data.description ||
        null
      let totalVulns = 0

      // Log process tracking information if available (Issue #181)
      if (processTracking) {
        logProcessTracking(
          processTracking,
          prefixLabel,
          summary,
          canonicalRunStatus
        )
      }

      // Note: dashboard_url may be null from Medusa contract; rendering layer handles null gracefully
      // Note: processTracking no longer checks reconcile_status (not part of Medusa contract)

      // Check run-level status first (canonical source of truth)
      // The run's top-level status is the authoritative indicator of run state
      if (canonicalRunStatus === 'failed') {
        const errorMsg =
          processTracking?.overall_status?.error_message ||
          processTracking?.find_status?.error_message ||
          'Run failed'
        const diagnostic = `run_status=failed: ${errorMsg}`
        core.error(`${prefixLabel}: Run failed - ${errorMsg}`)
        return {
          status: 'failed',
          reasonCode: 'RUN_FAILED',
          diagnostic,
          error: errorMsg,
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
      }

      if (canonicalRunStatus === 'completed') {
        const reconciliationDiagnostic =
          getCompletedRunReconciliationDiagnostic(processTracking)
        if (reconciliationDiagnostic) {
          core.warning(
            `${prefixLabel}: ${reconciliationDiagnostic.reasonCode} - ${reconciliationDiagnostic.diagnostic}`
          )
          return {
            status: 'progress',
            reasonCode: reconciliationDiagnostic.reasonCode,
            diagnostic: reconciliationDiagnostic.diagnostic,
            processTracking,
            summary,
            dashboard_url: dashboardUrl
          }
        }

        const handledErrors =
          summary?.handled_error_count ??
          processTracking?.triage_status?.handled_error_count ??
          0
        const manualReviewCount =
          summary?.needs_manual_review_count ??
          processTracking?.triage_status?.needs_manual_review_count ??
          0

        if (handledErrors > 0 || manualReviewCount > 0) {
          if (handledErrors > 0 && manualReviewCount > 0) {
            core.warning(
              `${prefixLabel}: Run completed with handled triage errors (${handledErrors}) and manual review required (${manualReviewCount}).`
            )
          } else if (handledErrors > 0) {
            core.warning(
              `${prefixLabel}: Run completed with handled triage errors (${handledErrors}).`
            )
          } else {
            core.warning(
              `${prefixLabel}: Run completed with manual review required (${manualReviewCount}).`
            )
          }
        } else {
          core.info(`${prefixLabel}: Run completed successfully`)
        }
        return {
          status: 'completed',
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
      }

      if (canonicalRunStatus === 'completed_with_warnings') {
        const reason =
          runStatusReason ||
          'Run completed with warnings. Review the run details.'
        const diagnostic = `run_status=completed_with_warnings: ${reason}`
        core.warning(`${prefixLabel}: Run completed with warnings: ${reason}`)
        return {
          status: 'completed',
          reasonCode: 'RUN_STATUS_COMPLETED_WITH_WARNINGS',
          diagnostic,
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
      }

      if (canonicalRunStatus === 'cancelled') {
        const diagnostic = 'run_status=cancelled'
        core.warning(`${prefixLabel}: Run was cancelled`)
        return {
          status: 'failed',
          reasonCode: 'RUN_CANCELLED',
          diagnostic,
          error: 'Run was cancelled',
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
      }

      // A paused run is a distinct, non-failure outcome: the server has
      // temporarily halted work (e.g. sustained Bedrock throttling) but has
      // preserved progress and will resume automatically once capacity
      // returns. Surface it clearly without treating it as a failure.
      if (canonicalRunStatus === 'paused') {
        const reason = runStatusReason || DEFAULT_PAUSE_REASON
        const diagnostic = `run_status=paused: ${reason}`
        core.warning(`${prefixLabel}: Run paused: ${reason}`)
        return {
          status: 'paused',
          reasonCode: RUN_PAUSED_REASON_CODE,
          diagnostic,
          pauseReason: reason,
          processTracking,
          summary,
          dashboard_url: dashboardUrl
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
              if (value?.extras?.needs_manual_review) {
                core.warning(
                  `${prefixLabel}: Manual review required: ${value?.extras?.needs_manual_review} vulnerabilities`
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

      if (hasCanonicalRunStatus) {
        return {
          status: 'progress',
          reasonCode: `RUN_STATUS_${canonicalRunStatus.toUpperCase()}`,
          diagnostic: `run_status=${canonicalRunStatus}`,
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
      }

      // Fallback: Check overall_status for backward compatibility with older API responses
      // that may not include run_status
      const overallStatus = processTracking?.overall_status?.status
      if (overallStatus === 'completed') {
        core.info(`${prefixLabel}: Processing completed successfully`)
        return {
          status: 'completed',
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
      } else if (overallStatus === 'failed') {
        const errorMsg =
          processTracking?.overall_status?.error_message || 'Processing failed'
        core.error(`${prefixLabel}: Processing failed - ${errorMsg}`)
        return {
          status: 'failed',
          error: errorMsg,
          processTracking,
          summary,
          dashboard_url: dashboardUrl
        }
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
          return {
            status: 'failed',
            error: errorMsg,
            processTracking,
            summary,
            dashboard_url: dashboardUrl
          }
        }

        // Check triage stage failure
        if (processTracking.triage_status?.status === 'failed') {
          const errorMsg =
            processTracking.triage_status.error_message ||
            'Triage analysis failed'
          core.error(`${prefixLabel}: Triage stage failed - ${errorMsg}`)
          return {
            status: 'failed',
            error: errorMsg,
            processTracking,
            summary,
            dashboard_url: dashboardUrl
          }
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
          return {
            status: 'failed',
            error: errorMsg,
            processTracking,
            summary,
            dashboard_url: dashboardUrl
          }
        }

        // Check push stage failure
        if (processTracking.push_status?.status === 'failed') {
          const errorMsg =
            processTracking.push_status.error_message ||
            'Pull request creation failed'
          core.error(`${prefixLabel}: Push stage failed - ${errorMsg}`)
          return {
            status: 'failed',
            error: errorMsg,
            processTracking,
            summary,
            dashboard_url: dashboardUrl
          }
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
            return {
              status: 'completed',
              processTracking,
              summary,
              dashboard_url: dashboardUrl
            }
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
          return {
            status: 'completed',
            processTracking,
            summary,
            dashboard_url: dashboardUrl
          }
        }
      }

      return {
        status: 'progress',
        processTracking,
        summary,
        dashboard_url: dashboardUrl
      }
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
        if (status === 401 || status === 403) {
          // Authorization failures are not transient; do not imply a retry helps.
          core.warning(
            `${prefixLabel} Authorization failed (HTTP ${status}). ` +
              `Verify the AppSecAI GitHub App is installed (${APP_INSTALL_URL}) and your organization has an active plan.`
          )
        } else if (status === 404) {
          core.warning(
            `${prefixLabel} Run status not found (HTTP 404). ` +
              'The run may not exist yet or the status endpoint is unavailable.'
          )
        } else if (status) {
          // Other status codes (e.g., 5xx) may be transient during polling.
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
export const MAX_RECONCILIATION_EXTENSION_POLLS = 20

export async function pollStatusUntilComplete(
  getStatusFunc: () => Promise<StatusResult>,
  maxRetries = 15,
  delay = 3000
): Promise<StatusResult | null> {
  const startTime = Date.now()
  let consecutiveNetworkErrors = 0
  let allowedAttempts = maxRetries
  let reconciliationExtensionPolls = 0
  let lastStatusData: StatusResult | null = null

  for (let retryCount = 0; retryCount < allowedAttempts; retryCount++) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
    const elapsedStr = formatElapsedTime(elapsedSeconds)

    // Create collapsible group for each poll iteration
    core.startGroup(`Status Update #${retryCount + 1} (${elapsedStr} elapsed)`)
    core.debug(`Status check attempt ${retryCount + 1}/${allowedAttempts}`)

    try {
      const statusData = await getStatusFunc()
      lastStatusData = statusData

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
        return statusData
      } else if (statusData.status === 'paused') {
        // A paused run is terminal for this polling pass (but not a failure):
        // stop polling and report it so the run is not mis-reported as failed
        // or polled indefinitely.
        core.info(
          `Run paused: ${statusData.pauseReason ?? statusData.diagnostic ?? 'work preserved; it will resume automatically when capacity returns'}.`
        )
        core.endGroup()
        return statusData
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
        if (statusData.reasonCode && statusData.diagnostic) {
          core.warning(
            `Status check non-terminal reason ${statusData.reasonCode}: ${statusData.diagnostic}`
          )
        }
        if (
          isReconciliationReason(statusData.reasonCode) &&
          retryCount + 1 >= allowedAttempts &&
          reconciliationExtensionPolls < MAX_RECONCILIATION_EXTENSION_POLLS
        ) {
          reconciliationExtensionPolls++
          allowedAttempts++
          core.info(
            `Extending polling for reconciliation (${reconciliationExtensionPolls}/${MAX_RECONCILIATION_EXTENSION_POLLS}).`
          )
        }
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

  const lastReason =
    lastStatusData?.reasonCode && lastStatusData?.diagnostic
      ? ` Last reason: ${lastStatusData.reasonCode} - ${lastStatusData.diagnostic}`
      : ''
  core.warning(
    `Processing timed out after ${allowedAttempts} attempts. The analysis may still be running on the server.` +
      `${lastReason} Monitor your repository for new pull requests and check the AppSecAI dashboard for run status and results.`
  )
  return null
}

/**
 * Configuration options for finalizeRun retry behavior.
 */
export interface FinalizeRunOptions {
  /** Expected number of PRs to be present in the summary. If provided, will retry until count matches. */
  expectedPrCount?: number
  /** Organization ID for org-scoped summary calls. */
  organizationId?: string
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
  const {
    expectedPrCount,
    organizationId,
    maxRetries = 3,
    retryDelay = 2000
  } = options
  const apiUrl = getApiUrl()
  const url = organizationId
    ? new URL(
        `${apiUrl}/api-product/organizations/${organizationId}/runs/${runId}/compute-summary`
      )
    : new URL(`${apiUrl}/api-product/runs/${runId}/compute-summary`)
  const prefixLabel = `[${LogLabels.RUN_FINALIZE}]`

  core.debug(`Calling finalize API: POST ${url.pathname}${url.search}`)

  let lastSummary: RunSummary | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    core.debug(`${prefixLabel}: Finalize attempt ${attempt}/${maxRetries}`)

    try {
      const response = await getActionRuntime().finalizeRun(runId, {
        organizationId
      })
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
        const status = error.response?.status
        if (error.code === 'ECONNABORTED') {
          core.warning(`${prefixLabel}: Request timed out`)
        } else if (status === 404) {
          core.warning(
            `${prefixLabel}: Run not found or finalize endpoint not available`
          )
          // Don't retry on 404 - the endpoint isn't available
          return lastSummary
        } else if (status === 401 || status === 403) {
          // Authorization failures are not transient; retrying will not help.
          core.warning(
            `${prefixLabel}: Could not compute summary - authorization failed (HTTP ${status}). ` +
              'Verify your organization has an active AppSecAI plan and access.'
          )
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
