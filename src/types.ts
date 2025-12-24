// src/types.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

export type RepoInfo = { repo: string; owner: string }

export type SubmitRunOutput = { message: string; run_id: string | null }

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

/**
 * Error codes returned by the Medusa/Product API.
 * Includes plan-related errors and account validation errors.
 */
export const PlanErrorCode = {
  // Plan-related errors
  PLAN_EXPIRED: 'PLAN_EXPIRED',
  NO_PLAN_ASSIGNED: 'NO_PLAN_ASSIGNED',
  PLAN_INACTIVE: 'PLAN_INACTIVE',
  // Account validation errors
  PERSONAL_ACCOUNT_NOT_SUPPORTED: 'PERSONAL_ACCOUNT_NOT_SUPPORTED',
  // Fallback
  UNKNOWN: 'UNKNOWN'
} as const

export type PlanErrorCode = (typeof PlanErrorCode)[keyof typeof PlanErrorCode]

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
  /** Current status of the plan assignment */
  status?: string
  /** Optional step list for processing steps */
  steps?: Array<{ name: string; status: string; detail: string }>
  /** Repository owner name (for account validation errors) */
  owner?: string
  /** Owner type: "User" or "Organization" (for account validation errors) */
  owner_type?: string
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
  /** Successfully processed items. Defaults to 0 via Zod schema. */
  success_count: number
  /** Failed items. Defaults to 0 via Zod schema. */
  error_count: number
  /** Items triaged as false positives (triage only). Defaults to 0. */
  false_positive_count: number
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
}
