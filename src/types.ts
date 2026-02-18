// src/types.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

export type RepoInfo = { repo: string; owner: string }

/**
 * Valid values for context_updated field in API responses.
 * - true: Context was successfully updated
 * - false: Context was not requested or not updated
 * - 'rate-limited': Context update was requested but rate limited
 */
export type ContextUpdatedStatus = boolean | 'rate-limited'

export type SubmitRunOutput = {
  message: string
  run_id: string | null
  context_updated?: ContextUpdatedStatus
}

export const ProcessingModeExternal = {
  INDIVIDUAL: 'individual',
  GROUP_ONLY: 'group_only',
  GROUP_WITH_REMEDIATION: 'group_with_remediation',
  GROUP_WITH_VALIDATION_CONSISTENCY: 'group_with_validation_consistency',
  PUSH: 'push',
  INDIVIDUAL_WITHOUT_PUSH: 'individual_without_push'
} as const

export type ProcessingModeExternal =
  (typeof ProcessingModeExternal)[keyof typeof ProcessingModeExternal]

export const TriageMethod = {
  BASELINE: 'baseline',
  ADVANCED: 'advanced',
  ML_BASED: 'ml_based',
  RULE_BASED: 'rule_based'
} as const

export type TriageMethod = (typeof TriageMethod)[keyof typeof TriageMethod]

export const RemediateMethod = {
  BASELINE: 'baseline',
  ADVANCED: 'advanced'
} as const

export type RemediateMethod =
  (typeof RemediateMethod)[keyof typeof RemediateMethod]

export const ValidateMethod = {
  BASELINE: 'baseline',
  ADVANCED: 'advanced'
} as const

export type ValidateMethod =
  (typeof ValidateMethod)[keyof typeof ValidateMethod]

export const CommentModificationMode = {
  BASIC: 'basic',
  VERBOSE: 'verbose'
} as const

export type CommentModificationMode =
  (typeof CommentModificationMode)[keyof typeof CommentModificationMode]

/**
 * Valid grouping strategy values for vulnerability grouping.
 * Determines how vulnerabilities are grouped together for remediation.
 *
 * - cwe_category: Group by CWE category (default)
 * - file_proximity: Group by file proximity in the codebase
 * - module: Group by code module or package
 * - smart: AI-powered smart grouping based on multiple factors
 */
export const GroupingStrategy = {
  CWE_CATEGORY: 'cwe_category',
  FILE_PROXIMITY: 'file_proximity',
  MODULE: 'module',
  SMART: 'smart'
} as const

export type GroupingStrategy =
  (typeof GroupingStrategy)[keyof typeof GroupingStrategy]

/**
 * Valid grouping stage values that control when grouping occurs in the pipeline.
 *
 * - pre_push: Group vulnerabilities before the push stage (default)
 * - pre_remediation: Group vulnerabilities before remediation begins
 */
export const GroupingStage = {
  PRE_PUSH: 'pre_push',
  PRE_REMEDIATION: 'pre_remediation'
} as const

export type GroupingStage = (typeof GroupingStage)[keyof typeof GroupingStage]

/**
 * Grouping configuration parameters for vulnerability grouping.
 * These parameters control how vulnerabilities are grouped for processing.
 */
export interface GroupingConfig {
  /** Whether grouping is enabled */
  enabled: boolean
  /** Strategy used for grouping vulnerabilities */
  strategy: GroupingStrategy
  /** Maximum number of vulnerabilities per pull request */
  maxVulnerabilitiesPerPr: number
  /** Stage at which grouping occurs in the pipeline */
  stage: GroupingStage
}

/**
 * Error codes returned by the Medusa/Product API.
 * Includes plan-related errors, quota errors, and account validation errors.
 */
export const PlanErrorCode = {
  // Plan-related errors
  PLAN_EXPIRED: 'PLAN_EXPIRED',
  NO_PLAN_ASSIGNED: 'NO_PLAN_ASSIGNED',
  PLAN_INACTIVE: 'PLAN_INACTIVE',
  // Account validation errors
  PERSONAL_ACCOUNT_NOT_SUPPORTED: 'PERSONAL_ACCOUNT_NOT_SUPPORTED',
  // Quota-related errors
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  // Server errors
  SERVER_ERROR: 'SERVER_ERROR',
  // Fallback
  UNKNOWN: 'UNKNOWN'
} as const

export type PlanErrorCode = (typeof PlanErrorCode)[keyof typeof PlanErrorCode]

/**
 * Quota usage information returned when quota is exceeded.
 */
export interface QuotaInfo {
  /** Number of resources (runs) already used */
  used: number
  /** Maximum allowed resources (runs) for the current period */
  limit: number
  /** Type of resource being tracked (e.g., "runs") */
  resource: string
}

/**
 * Structured error detail returned by the Medusa/Product API.
 * Provides actionable information about failures.
 */
export interface StructuredErrorDetail {
  /** Error code identifying the type of error */
  code?: string
  /** Human-readable error description */
  description?: string
  /** Organization ID associated with the error */
  organization_id?: string
  /** Assignment ID for the plan assignment */
  assignment_id?: string
  /** Expiration timestamp for expired plans (ISO 8601 format) */
  expires_at?: string
  /** End of the current billing period (ISO 8601 format) */
  period_end?: string
  /** Current status of the plan assignment */
  status?: string
  /** Optional step list for processing steps */
  steps?: Array<{ name: string; status: string; detail: string }>
  /** Repository owner name (for account validation errors) */
  owner?: string
  /** Owner type: "User" or "Organization" (for account validation errors) */
  owner_type?: string
  /** Quota usage information (for quota exceeded errors) */
  quota_info?: QuotaInfo
}

/**
 * Quota-specific error detail returned by the API for HTTP 429 errors.
 * Contains usage information and billing period details.
 */
export interface QuotaErrorDetail {
  /** Error type identifier */
  error?: string
  /** Human-readable error message */
  message?: string
  /** Number of runs used in the current period */
  quota_used?: number
  /** Maximum runs allowed in the current period */
  quota_limit?: number
  /** Start of the current billing period (YYYY-MM-DD format) */
  period_start?: string
  /** End of the current billing period (YYYY-MM-DD format) */
  period_end?: string
}

/**
 * Parsed API error with HTTP status code and extracted details.
 * Used for formatting user-friendly error messages.
 */
export interface ParsedApiError {
  /** HTTP status code from the response */
  statusCode: number
  /** Error code from the response body (if available) */
  errorCode?: string
  /** Error message from the response body */
  message: string
  /** Quota-specific details (for 429 errors) */
  quotaDetails?: QuotaErrorDetail
  /** Structured error details (for plan-related errors) */
  structuredDetails?: StructuredErrorDetail
  /** Raw error message from axios */
  rawError?: string
}

/**
 * Valid status values for process tracking stages.
 */
export const ProcessStatusValue = {
  NOT_STARTED: 'not_started',
  INITIATED: 'initiated',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const

export type ProcessStatusValue =
  (typeof ProcessStatusValue)[keyof typeof ProcessStatusValue]

/**
 * Status information for individual processes within a run.
 * Mirrors Medusa/Product API's ProcessStatus model.
 *
 * Note: The Zod schema (ProcessStatusSchema) provides defaults for numeric fields,
 * so parsed data will always have valid values even if the API returns partial data.
 */
export interface ProcessStatus {
  /**
   * Process status. Should be one of ProcessStatusValue values:
   * 'not_started', 'initiated', 'in_progress', 'completed', 'failed'
   *
   * Note: Type is string to remain compatible with Zod schema output and
   * forward-compatible if the API adds new status values.
   */
  status: string
  /** When the process started (ISO 8601 format). API may return null. */
  started_at?: string | null
  /** When the process completed (ISO 8601 format). API may return null. */
  completed_at?: string | null
  /** Progress percentage (0-100). Defaults to 0 via Zod schema. */
  progress_percentage: number
  /** Error message if failed. API may return null. */
  error_message?: string | null
  /** Total items to process. Defaults to 0 via Zod schema. */
  total_items: number
  /** Items processed so far. Defaults to 0 via Zod schema. */
  processed_items: number
  /** Successfully processed items (includes warnings). Defaults to 0 via Zod schema. */
  success_count: number
  /** Actual processing exceptions. Defaults to 0 via Zod schema. */
  error_count: number
  /** Items triaged as false positives (triage only). Defaults to 0. */
  false_positive_count: number
  /** Issues created with validation warnings (security passed, other checks failed). Defaults to 0. */
  self_validation_warning_count: number
  /** Skipped vulnerabilities (security not resolved). Defaults to 0. */
  self_validation_failure_count: number
  /** PRs created with 'Additional Context Required' prefix (multi-step CWE). Defaults to 0. */
  additional_context_required_count: number
}

/**
 * Process tracking for each stage of a run.
 * Mirrors Medusa/Product API's RunProcessTracking model.
 */
export interface RunProcessTracking {
  /** Find/import process status */
  find_status?: ProcessStatus
  /** Triage process status */
  triage_status?: ProcessStatus
  /** Remediation process status */
  remediate_status?: ProcessStatus
  /** Validation process status */
  validate_status?: ProcessStatus
  /** Push process status */
  push_status?: ProcessStatus
  /** Remediation-validation loop status */
  remediation_validation_loop_status?: ProcessStatus
  /** Grouping process status */
  grouping_status?: ProcessStatus
  /** Group remediation status */
  group_remediate_status?: ProcessStatus
  /** Group validation status */
  group_validate_status?: ProcessStatus
  /** Overall run status */
  overall_status?: ProcessStatus
}

/**
 * Summary of run results with actionable metrics.
 * Mirrors Product API's RunSummary model.
 */
export interface RunSummary {
  /** Total number of vulnerabilities found */
  total_vulnerabilities: number
  /** Number of confirmed true positive vulnerabilities */
  true_positives: number
  /** Number of false positive vulnerabilities filtered out */
  false_positives: number
  /** Breakdown of vulnerabilities by CWE type (CWE ID -> count) */
  cwe_breakdown: Record<string, number>
  /** Breakdown of vulnerabilities by severity level (severity -> count) */
  severity_breakdown: Record<string, number>
  /** Number of successfully remediated vulnerabilities */
  remediation_success: number
  /** Number of failed remediation attempts */
  remediation_failed: number
  /** List of created pull request URLs */
  pr_urls: string[]
  /** Total number of pull requests created */
  pr_count: number
  /** List of GitHub Issue URLs created for validation warnings */
  issue_urls?: string[]
  /** Total number of GitHub Issues created */
  issue_count?: number
  /** Number of vulnerabilities skipped (security not resolved) */
  skipped_count?: number
  /** Number of issues created due to validation failures (security passed, functional/quality checks failed) */
  issues_validation_warning?: number
  /** Number of issues created due to multi-step CWEs (validation passed, additional steps required) */
  issues_multistep_cwe?: number
}

/**
 * Result from status polling.
 * Contains the processing status and optional tracking/summary data.
 */
export interface StatusResult {
  /** Processing status: 'completed', 'failed', 'in_progress', or 'network_error' */
  status: string
  /** Error message if status is 'failed' */
  error?: string
  /** Process tracking information for all stages (null when not available from API) */
  processTracking?: Partial<RunProcessTracking> | null
  /** Summary of run results (null when not available from API) */
  summary?: Partial<RunSummary> | null
}
