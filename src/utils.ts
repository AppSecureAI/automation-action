// src/utils.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import {
  ProcessStatusValue,
  type ProcessStatus,
  type RunProcessTracking,
  type RunSummary
} from './types.js'
import {
  LogLabels,
  getMarkdownBranding,
  getConsoleBranding,
  TroubleshootingGuidance
} from './constants.js'
import { parsePrUrl } from './titles.js'
import type { GroupingConfig } from './types.js'

/**
 * Mapping of internal stage names to user-friendly display names
 */
export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  find: 'Vulnerability Import',
  reconcile: 'Reconcile Findings',
  triage: 'Triage Analysis',
  remediation_loop: 'Remediation',
  remediation_validation_loop: 'Remediation',
  push: 'Pull Requests'
}

/**
 * Get user-friendly display name for a stage
 */
export function getDisplayName(internalName: string): string {
  return STAGE_DISPLAY_NAMES[internalName] || internalName
}

function getTriageBreakdown(status: ProcessStatus): {
  confirmed: number
  falsePositives: number
  manualReviewRequired: number
} {
  const falsePositives = status.false_positive_count || 0
  const manualReviewRequired = status.needs_manual_review_count || 0
  const confirmed = Math.max(
    0,
    (status.success_count || 0) - falsePositives - manualReviewRequired
  )

  return { confirmed, falsePositives, manualReviewRequired }
}

/**
 * Status icons for visual scanning
 */
const STATUS_ICONS = {
  completed: '✅',
  in_progress: '⏳',
  pending: '⏸️',
  failed: '❌',
  initiated: '🔄'
}

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

type CountSource = Record<string, unknown>

function getNumericField(
  source: CountSource | null | undefined,
  fields: string[]
): number {
  if (!source) return 0
  for (const field of fields) {
    const value = source[field]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return 0
}

function hasAnyField(
  source: CountSource | null | undefined,
  fields: string[]
): boolean {
  if (!source) return false
  return fields.some((field) =>
    Object.prototype.hasOwnProperty.call(source, field)
  )
}

function getBreakdownField(
  source: CountSource | null | undefined,
  breakdownName: string,
  fields: string[]
): number {
  const breakdown = source?.[breakdownName]
  if (!breakdown || typeof breakdown !== 'object') {
    return 0
  }
  return getNumericField(breakdown as CountSource, fields)
}

function getNumericFieldOrBreakdown(
  source: CountSource | null | undefined,
  fields: string[],
  breakdowns: Array<{ name: string; fields: string[] }> = []
): number {
  const direct = getNumericField(source, fields)
  if (direct > 0 || hasAnyField(source, fields)) {
    return direct
  }
  for (const breakdown of breakdowns) {
    const value = getBreakdownField(source, breakdown.name, breakdown.fields)
    if (value > 0) {
      return value
    }
  }
  return 0
}

function hasBreakdownFields(
  source: CountSource | null | undefined,
  breakdownName: string,
  fields: string[]
): boolean {
  const breakdown = source?.[breakdownName]
  if (!breakdown || typeof breakdown !== 'object') {
    return false
  }
  return hasAnyField(breakdown as CountSource, fields)
}

function getCustomerVisiblePrCount(
  summary?: Partial<RunSummary> | null,
  status?: ProcessStatus
): number {
  const summaryCount = getNumericField(
    summary as unknown as CountSource | null,
    ['customer_visible_pr_count', 'pr_count']
  )
  if (
    summaryCount > 0 ||
    Object.prototype.hasOwnProperty.call(
      summary ?? {},
      'customer_visible_pr_count'
    ) ||
    Object.prototype.hasOwnProperty.call(summary ?? {}, 'pr_count')
  ) {
    return summaryCount
  }
  return getNumericField(status as unknown as CountSource | null, [
    'customer_visible_pr_count',
    'pr_count',
    'success_count'
  ])
}

function getRunTaxonomy(summary?: Partial<RunSummary> | null): {
  vendorExcluded: number
  falsePositives: number
  duplicates: number
  manualReview: number
  validationFailures: number
  scopeFailures: number
  remediationUnitFailures: number
  droppedFromPr: number
  pushFailures: number
  notAttempted: number
  internalNonPushedAttempts: number
  internalNonPushedFindings: number
} {
  const source = summary as unknown as CountSource | null
  return {
    vendorExcluded: getNumericFieldOrBreakdown(
      source,
      [
        'vendor_excluded_count',
        'vendor_exclusion_count',
        'vendor_exclusions_count',
        'excluded_count'
      ],
      [{ name: 'outcome_breakdown', fields: ['vendor_exclusion'] }]
    ),
    falsePositives: getNumericFieldOrBreakdown(
      source,
      [
        'triaged_false_positive_count',
        'false_positives',
        'false_positive_count'
      ],
      [{ name: 'outcome_breakdown', fields: ['false_positive'] }]
    ),
    duplicates: getNumericFieldOrBreakdown(
      source,
      [
        'scanner_correlated_duplicate_count',
        'correlated_duplicate_count',
        'duplicate_count',
        'dedup_skipped_count'
      ],
      [{ name: 'outcome_breakdown', fields: ['duplicate_or_correlated'] }]
    ),
    manualReview: getNumericFieldOrBreakdown(
      source,
      ['needs_manual_review_count', 'manual_review_count'],
      [{ name: 'outcome_breakdown', fields: ['needs_manual_review'] }]
    ),
    validationFailures: getNumericFieldOrBreakdown(
      source,
      ['remediation_validation_failed_count', 'validation_failure_count'],
      [
        { name: 'outcome_breakdown', fields: ['validation_failed'] },
        { name: 'push_outcome_breakdown', fields: ['validation_failed'] }
      ]
    ),
    scopeFailures: getNumericField(source, ['scope_validation_failure_count']),
    remediationUnitFailures: getNumericFieldOrBreakdown(
      source,
      ['remediation_unit_failure_count', 'internal_non_pushed_attempts'],
      [
        { name: 'outcome_breakdown', fields: ['remediation_failed'] },
        {
          name: 'push_outcome_breakdown',
          fields: ['failed_remediation_unit']
        }
      ]
    ),
    droppedFromPr: getNumericFieldOrBreakdown(
      source,
      ['dropped_from_pr_count'],
      [
        { name: 'outcome_breakdown', fields: ['dropped_from_pr'] },
        { name: 'push_outcome_breakdown', fields: ['dropped_from_pr'] }
      ]
    ),
    pushFailures: getNumericFieldOrBreakdown(
      source,
      [
        'github_push_failure_count',
        'push_failed_count',
        'push_failure_count',
        'github_api_failure_count',
        'api_failure_count'
      ],
      [
        { name: 'outcome_breakdown', fields: ['push_failed'] },
        { name: 'push_outcome_breakdown', fields: ['github_push_failed'] }
      ]
    ),
    notAttempted: getNumericFieldOrBreakdown(
      source,
      ['not_attempted_count'],
      [
        { name: 'outcome_breakdown', fields: ['not_attempted'] },
        { name: 'push_outcome_breakdown', fields: ['not_attempted'] }
      ]
    ),
    internalNonPushedAttempts: getNumericField(source, [
      'internal_non_pushed_attempts'
    ]),
    internalNonPushedFindings: getNumericField(source, [
      'internal_non_pushed_findings'
    ])
  }
}

function hasAnyTypedTaxonomyField(
  summary?: Partial<RunSummary> | null
): boolean {
  const source = summary as unknown as CountSource | null
  return (
    hasAnyField(source, [
      'vendor_excluded_count',
      'vendor_exclusion_count',
      'vendor_exclusions_count',
      'excluded_count',
      'scanner_correlated_duplicate_count',
      'correlated_duplicate_count',
      'duplicate_count',
      'scope_validation_failure_count',
      'remediation_validation_failed_count',
      'remediation_unit_failure_count',
      'dropped_from_pr_count',
      'push_failed_count',
      'github_push_failure_count',
      'internal_non_pushed_attempts',
      'internal_non_pushed_findings',
      'not_attempted_count'
    ]) ||
    hasBreakdownFields(source, 'outcome_breakdown', [
      'vendor_exclusion',
      'duplicate_or_correlated',
      'validation_failed',
      'remediation_failed',
      'dropped_from_pr',
      'push_failed',
      'not_attempted'
    ]) ||
    hasBreakdownFields(source, 'push_outcome_breakdown', [
      'failed_remediation_unit',
      'validation_failed',
      'dropped_from_pr',
      'github_push_failed',
      'not_attempted'
    ])
  )
}

function formatTaxonomyItems(
  summary?: Partial<RunSummary> | null,
  options: {
    includeExpectedTriage?: boolean
    includePushFailures?: boolean
  } = {}
): string[] {
  const taxonomy = getRunTaxonomy(summary)
  const items: string[] = []
  if (options.includeExpectedTriage && taxonomy.vendorExcluded > 0) {
    items.push(`${taxonomy.vendorExcluded} vendor/excluded`)
  }
  if (options.includeExpectedTriage && taxonomy.falsePositives > 0) {
    items.push(`${taxonomy.falsePositives} false positives`)
  }
  if (options.includeExpectedTriage && taxonomy.duplicates > 0) {
    items.push(`${taxonomy.duplicates} duplicates/correlated`)
  }
  if (options.includeExpectedTriage && taxonomy.manualReview > 0) {
    items.push(`${taxonomy.manualReview} manual review`)
  }
  if (taxonomy.scopeFailures > 0) {
    items.push(`${taxonomy.scopeFailures} scope validation failures`)
  }
  if (taxonomy.validationFailures > 0) {
    items.push(`${taxonomy.validationFailures} remediation validation failures`)
  }
  if (taxonomy.remediationUnitFailures > 0) {
    items.push(`${taxonomy.remediationUnitFailures} remediation unit failures`)
  }
  if (taxonomy.droppedFromPr > 0) {
    items.push(`${taxonomy.droppedFromPr} dropped from PR output`)
  }
  if (taxonomy.notAttempted > 0) {
    items.push(`${taxonomy.notAttempted} not attempted`)
  }
  if (options.includePushFailures && taxonomy.pushFailures > 0) {
    items.push(`${taxonomy.pushFailures} GitHub push/API failures`)
  }
  return items
}

function hasTypedNoPrReason(summary?: Partial<RunSummary> | null): boolean {
  const taxonomy = getRunTaxonomy(summary)
  const hasTypedTerminalReason =
    taxonomy.vendorExcluded > 0 ||
    taxonomy.duplicates > 0 ||
    taxonomy.validationFailures > 0 ||
    taxonomy.scopeFailures > 0 ||
    taxonomy.remediationUnitFailures > 0 ||
    taxonomy.droppedFromPr > 0 ||
    taxonomy.notAttempted > 0 ||
    taxonomy.internalNonPushedFindings > 0 ||
    hasAnyTypedTaxonomyField(summary)
  const total = getNumericField(summary as unknown as CountSource | null, [
    'total_vulnerabilities'
  ])
  const expectedNoActionCount =
    taxonomy.falsePositives + taxonomy.manualReview + taxonomy.vendorExcluded
  const allFindingsAreNoAction =
    total > 0 &&
    getNumericField(summary as unknown as CountSource | null, [
      'true_positives'
    ]) === 0 &&
    expectedNoActionCount >= total

  return hasTypedTerminalReason || allFindingsAreNoAction
}

function formatNoCustomerPrReason(
  summary?: Partial<RunSummary> | null
): string {
  const items = formatTaxonomyItems(summary, { includeExpectedTriage: true })
  const internalFindings = getRunTaxonomy(summary).internalNonPushedFindings
  if (internalFindings > 0) {
    items.push(`${internalFindings} internal non-pushed findings`)
  }
  return items.length > 0 ? ` - ${items.join(', ')}` : ''
}

/**
 * Get the Dashboard URL based on the API URL.
 * Defaults customer-facing output to production unless an integration host is detected.
 */
export function getDashboardUrl(apiUrl: string): string {
  if (
    apiUrl.includes('gh.intg.appsecai.net') ||
    apiUrl.includes('api.intg.appsecai.net')
  ) {
    return 'https://app.intg.appsecai.net/'
  }

  return 'https://portal.cloud.appsecai.io/'
}

/**
 * Get troubleshooting guidance based on the step name
 * @param stepName The name of the failed step
 * @returns Array of troubleshooting suggestions
 */
function getTroubleshootingGuidance(stepName: string): readonly string[] {
  const normalizedName = stepName.toLowerCase()

  if (
    normalizedName.includes('sarif') ||
    normalizedName.includes('upload sarif')
  ) {
    return TroubleshootingGuidance.SARIF_UPLOAD
  }
  if (
    normalizedName.includes('source code') ||
    normalizedName.includes('upload code')
  ) {
    return TroubleshootingGuidance.CODE_UPLOAD
  }
  if (
    normalizedName.includes('auth') ||
    normalizedName.includes('token') ||
    normalizedName.includes('installation')
  ) {
    return TroubleshootingGuidance.AUTHENTICATION
  }

  return TroubleshootingGuidance.GENERIC
}

/**
 * Check if a detail string is empty or contains no useful information
 * @param detail The detail string to check
 * @returns true if the detail is effectively empty
 */
function isEmptyDetail(detail: string | undefined | null): boolean {
  if (!detail) return true
  const trimmed = detail.trim()
  return (
    trimmed === '' ||
    trimmed === '[]' ||
    trimmed === 'null' ||
    trimmed === 'undefined'
  )
}

/**
 * Logs steps with appropriate logging level based on status.
 * For failed steps with empty details, provides actionable troubleshooting guidance.
 * @param steps Array of steps to log
 * @param apiContext Optional string to indicate which API call these steps are related to
 */
export function logSteps(
  steps: Array<{ name: string; status: string; detail: string }>,
  apiContext?: string
): void {
  steps.forEach((step) => {
    const isFailed = step.status !== 'completed'
    const logFunction = isFailed ? core.error : core.info
    const prefix = apiContext ? `[${apiContext}] ` : ''

    logFunction(`${prefix}------ ${step.name} ------`)
    logFunction(`${prefix}status: [${step.status}]`)

    // Provide helpful guidance when detail is empty on a failed step
    if (isFailed && isEmptyDetail(step.detail)) {
      logFunction(`${prefix}detail: [No details provided by server]`)
      logFunction(`${prefix}`)
      logFunction(`${prefix}Troubleshooting steps:`)

      const guidance = getTroubleshootingGuidance(step.name)
      guidance.forEach((tip, index) => {
        logFunction(`${prefix}  ${index + 1}. ${tip}`)
      })
    } else {
      logFunction(`${prefix}detail: [${step.detail}]`)
    }

    logFunction(`${prefix}------ ------`)
  })
}

/**
 * Format a single stage status into a human-readable string
 * @param name The internal stage name (e.g., 'triage', 'remediation_validation_loop')
 * @param status The ProcessStatus object for this stage
 * @param remediationLoopStatus Optional remediation loop status to check if still in progress (for push formatting)
 * @returns A formatted status string with user-friendly names
 */
export function formatStageStatus(
  name: string,
  status?: ProcessStatus,
  remediationLoopStatus?: ProcessStatus,
  summary?: Partial<RunSummary> | null,
  runStatus?: string | null
): string {
  const displayName = getDisplayName(name)

  if (!status || status.status === ProcessStatusValue.NOT_STARTED) {
    return `${STATUS_ICONS.pending} ${displayName}: Pending`
  }

  if (status.status === ProcessStatusValue.INITIATED) {
    return `${STATUS_ICONS.initiated} ${displayName}: Initializing...`
  }

  if (status.status === ProcessStatusValue.COMPLETED) {
    const details: string[] = []
    // For triage/Analysis, show confirmed vulnerabilities and false positives
    if (name === 'triage') {
      const triageBreakdown = getTriageBreakdown(status)
      if (triageBreakdown.confirmed > 0) {
        details.push(`${triageBreakdown.confirmed} confirmed vulnerabilities`)
      }
      if (triageBreakdown.falsePositives > 0) {
        details.push(`${triageBreakdown.falsePositives} false positives`)
      }
      if (triageBreakdown.manualReviewRequired > 0) {
        details.push(
          `${triageBreakdown.manualReviewRequired} require manual review`
        )
      }
      if ((status.handled_error_count || 0) > 0) {
        details.push(`${status.handled_error_count} handled errors`)
      }
    } else if (name === 'push') {
      // For push, show PRs created
      const prCount = getCustomerVisiblePrCount(summary, status)
      if (prCount > 0) {
        details.push(`${prCount} PRs created`)
      } else if (hasTypedNoPrReason(summary)) {
        details.push(
          `No customer-visible PRs created${formatNoCustomerPrReason(summary)}`
        )
      }
    } else if (name === 'find') {
      // For find/scan, show vulnerabilities found
      if (status.success_count > 0) {
        details.push(`${status.success_count} vulnerabilities found`)
      }
    } else if (name === 'reconcile') {
      // For reconcile, show how many findings were validated
      if (status.total_items > 0) {
        details.push(
          `${status.success_count}/${status.total_items} findings validated`
        )
      }
    } else if (
      name === 'remediation_loop' ||
      name === 'remediation_validation_loop'
    ) {
      // For remediation loop, show success count and validation metrics
      if (status.success_count > 0) {
        details.push(`${status.success_count} fixes generated`)
      }
      // Show additional context required count (multi-step CWE PRs)
      const contextCount = status.additional_context_required_count || 0
      if (contextCount > 0) {
        details.push(`${contextCount} need additional context`)
      }
      // Show self-validation warning count (security passed but functional/quality checks failed)
      const warningCount = status.self_validation_warning_count || 0
      if (warningCount > 0) {
        details.push(
          `${warningCount} security-passed warnings (functional/quality checks failed)`
        )
      }
      // Show self-validation failure count (validation failed - issue created instead of PR)
      const failureCount = status.self_validation_failure_count || 0
      if (failureCount > 0) {
        details.push(`${failureCount} skipped (security not resolved)`)
      }
      const scopeFailureCount = status.scope_validation_failure_count || 0
      if (scopeFailureCount > 0) {
        details.push(`${scopeFailureCount} scope validation failures`)
      }
    } else if (status.success_count > 0) {
      // For other stages
      details.push(`${status.success_count} fixes generated`)
    }
    if (status.error_count > 0) {
      details.push(`${status.error_count} errors`)
    }
    if (details.length === 0 && status.total_items > 0) {
      details.push(`${status.total_items} processed`)
    }
    const detailStr = details.length > 0 ? ` (${details.join(', ')})` : ''
    return `${STATUS_ICONS.completed} ${displayName}: Completed${detailStr}`
  }

  if (status.status === ProcessStatusValue.IN_PROGRESS) {
    const pct = status.progress_percentage.toFixed(0)
    // For triage/Analysis, show confirmed vulnerabilities found so far
    if (name === 'triage') {
      const triageBreakdown = getTriageBreakdown(status)
      const triageDetails = [
        `${triageBreakdown.confirmed} confirmed`,
        `${triageBreakdown.falsePositives} false positives`
      ]
      if (triageBreakdown.manualReviewRequired > 0) {
        triageDetails.push(
          `${triageBreakdown.manualReviewRequired} manual review`
        )
      }
      return `${STATUS_ICONS.in_progress} ${displayName}: ${status.processed_items}/${status.total_items} (${pct}%) - ${triageDetails.join(', ')}`
    }
    // Special handling for push/PRs when remediation is still in progress
    if (
      name === 'push' &&
      remediationLoopStatus?.status === ProcessStatusValue.IN_PROGRESS
    ) {
      const prCount = getCustomerVisiblePrCount(summary, status)
      const remediatedVulns = remediationLoopStatus.processed_items || 0
      const totalVulns = remediationLoopStatus.total_items || 0
      const remainingVulns = Math.max(0, totalVulns - remediatedVulns)
      const details: string[] = []

      if (remediatedVulns > 0) {
        details.push(
          pluralize(remediatedVulns, 'vulnerability', 'vulnerabilities')
        )
      }
      if (remainingVulns > 0) {
        details.push(`${remainingVulns} still in remediation`)
      } else {
        details.push('more expected as remediation continues')
      }

      return `${STATUS_ICONS.in_progress} ${displayName}: ${pluralize(prCount, 'PR')} created (${details.join(', ')})`
    }
    // For push, use PR terminology
    if (name === 'push') {
      const prCount = getCustomerVisiblePrCount(summary, status)
      const totalPrs = summary?.customer_visible_pr_count ?? status.total_items
      return `${STATUS_ICONS.in_progress} ${displayName}: ${prCount}/${totalPrs} PRs (${pct}%)`
    }
    return `${STATUS_ICONS.in_progress} ${displayName}: ${status.processed_items}/${status.total_items} (${pct}%)`
  }

  if (status.status === ProcessStatusValue.FAILED) {
    if (name === 'push') {
      const prCount = getCustomerVisiblePrCount(summary, status)
      const pushFailureCount = getRunTaxonomy(summary).pushFailures
      if (prCount === 0 && pushFailureCount === 0 && !status.error_message) {
        if (hasTypedNoPrReason(summary)) {
          return `${STATUS_ICONS.completed} ${displayName}: Completed (No customer-visible PRs created${formatNoCustomerPrReason(summary)})`
        }
        if (runStatus === 'completed') {
          return `${STATUS_ICONS.completed} ${displayName}: Completed (No customer-visible PRs created)`
        }
      }
      if (pushFailureCount > 0 && !status.error_message) {
        return `${STATUS_ICONS.failed} ${displayName}: Failed - ${pluralize(pushFailureCount, 'GitHub push/API failure')}`
      }
    }
    const errorMsg = status.error_message || 'unknown error'
    return `${STATUS_ICONS.failed} ${displayName}: Failed - ${errorMsg}`
  }

  return `${displayName}: ${status.status}`
}

/**
 * Log all process tracking stages
 * @param tracking The RunProcessTracking object
 * @param prefixLabel The log prefix label (e.g., '[RUN_STATUS]')
 */
export function logProcessTracking(
  tracking: RunProcessTracking | null | undefined,
  prefixLabel: string,
  summary?: Partial<RunSummary> | null,
  runStatus?: string | null
): void {
  if (!tracking) {
    return
  }

  // Define the stages to display in order with user-friendly names
  const stages: Array<{ field: keyof RunProcessTracking; name: string }> = [
    { field: 'find_status', name: 'find' },
    { field: 'triage_status', name: 'triage' },
    { field: 'remediation_validation_loop_status', name: 'remediation_loop' },
    { field: 'push_status', name: 'push' }
  ]

  // Log each stage that has a status
  for (const { field, name } of stages) {
    const status = tracking[field]
    if (status) {
      // Pass remediation loop status for special push formatting
      const remediationLoopStatus = tracking.remediation_validation_loop_status
      const formatted = formatStageStatus(
        name,
        status,
        remediationLoopStatus,
        summary,
        runStatus
      )
      core.info(`${prefixLabel}: ${formatted}`)
    }
  }
}

/**
 * Get status icon for a given status
 */
function getStatusIcon(status?: string): string {
  if (!status || status === ProcessStatusValue.NOT_STARTED) {
    return STATUS_ICONS.pending
  }
  if (status === ProcessStatusValue.COMPLETED) {
    return STATUS_ICONS.completed
  }
  if (status === ProcessStatusValue.IN_PROGRESS) {
    return STATUS_ICONS.in_progress
  }
  if (status === ProcessStatusValue.FAILED) {
    return STATUS_ICONS.failed
  }
  if (status === ProcessStatusValue.INITIATED) {
    return STATUS_ICONS.initiated
  }
  return '❓'
}

/**
 * Get human-readable status text
 */
function getStatusText(status?: string): string {
  if (!status || status === ProcessStatusValue.NOT_STARTED) {
    return 'Pending'
  }
  if (status === ProcessStatusValue.COMPLETED) {
    return 'Completed'
  }
  if (status === ProcessStatusValue.IN_PROGRESS) {
    return 'In Progress'
  }
  if (status === ProcessStatusValue.FAILED) {
    return 'Failed'
  }
  if (status === ProcessStatusValue.INITIATED) {
    return 'Starting'
  }
  return status
}

/**
 * Format details for job summary based on stage and status
 */
function formatSummaryDetails(
  name: string,
  status?: ProcessStatus,
  summary?: Partial<RunSummary> | null
): string {
  if (!status) {
    return '-'
  }

  if (name === 'triage') {
    const triageBreakdown = getTriageBreakdown(status)
    if (
      triageBreakdown.confirmed > 0 ||
      triageBreakdown.falsePositives > 0 ||
      triageBreakdown.manualReviewRequired > 0
    ) {
      const parts = [
        `${triageBreakdown.confirmed} confirmed`,
        `${triageBreakdown.falsePositives} false positives`
      ]
      if (triageBreakdown.manualReviewRequired > 0) {
        parts.push(`${triageBreakdown.manualReviewRequired} manual review`)
      }
      if ((status.handled_error_count || 0) > 0) {
        parts.push(`${status.handled_error_count} handled errors`)
      }
      return parts.join(', ')
    }
  } else if (name === 'push') {
    const prCount = getCustomerVisiblePrCount(summary, status)
    if (prCount > 0) {
      return `${prCount} PRs created`
    }
    if (hasTypedNoPrReason(summary)) {
      return `No customer-visible PRs created${formatNoCustomerPrReason(summary)}`
    }
  } else if (name === 'find') {
    if (status.success_count > 0) {
      return `${status.success_count} vulnerabilities`
    }
  } else if (name === 'reconcile') {
    if (status.total_items > 0) {
      return `${status.success_count}/${status.total_items} findings validated`
    }
  } else if (
    name === 'remediation_loop' ||
    name === 'remediation_validation_loop'
  ) {
    // For remediation loop, show detailed metrics
    const parts: string[] = []
    if (status.success_count > 0) {
      parts.push(`${status.success_count} fixed`)
    }
    const contextCount = status.additional_context_required_count || 0
    if (contextCount > 0) {
      parts.push(`${contextCount} need context`)
    }
    const warningCount = status.self_validation_warning_count || 0
    if (warningCount > 0) {
      parts.push(
        `${warningCount} security-passed warnings (functional/quality checks failed)`
      )
    }
    const failureCount = status.self_validation_failure_count || 0
    if (failureCount > 0) {
      parts.push(`${failureCount} skipped (security not resolved)`)
    }
    const scopeFailureCount = status.scope_validation_failure_count || 0
    if (scopeFailureCount > 0) {
      parts.push(`${scopeFailureCount} scope validation failures`)
    }
    if (parts.length > 0) {
      return parts.join(', ')
    }
    if (status.total_items > 0) {
      return `${status.processed_items}/${status.total_items}`
    }
  } else if (status.success_count > 0) {
    return `${status.success_count} processed`
  }

  if (status.total_items > 0) {
    return `${status.processed_items}/${status.total_items}`
  }

  return '-'
}

/**
 * Write job summary markdown to the GitHub Actions summary
 * @param tracking The RunProcessTracking object
 * @param summary The RunSummary object with metrics
 * @param runId The run ID
 * @param durationMs Duration in milliseconds
 * @param success Whether the run completed successfully
 * @param prTitles Optional map of PR URL to title
 * @param dashboardUrl Optional dashboard URL to display
 * @param groupingConfig Optional grouping configuration to display
 * @param issueTitles Optional map of issue URL to title
 */
export async function writeJobSummary(
  tracking: RunProcessTracking | null | undefined,
  summary: RunSummary | null,
  runId: string | null,
  durationMs: number,
  success: boolean,
  prTitles?: Map<string, string>,
  dashboardUrl?: string,
  groupingConfig?: GroupingConfig,
  issueTitles?: Map<string, string>
): Promise<void> {
  const durationStr = formatDuration(durationMs)

  // Add branding at the top
  core.summary.addRaw(getMarkdownBranding() + '\n\n', true)

  // Start building the summary
  core.summary.addHeading('AppSecAI Results', 2)

  const handledErrorCount =
    summary?.handled_error_count ??
    tracking?.triage_status?.handled_error_count ??
    0
  const manualReviewCount =
    summary?.needs_manual_review_count ??
    tracking?.triage_status?.needs_manual_review_count ??
    0
  const hasHandledErrors =
    Boolean(summary?.has_handled_errors) || handledErrorCount > 0
  const hasManualReviewOnly = manualReviewCount > 0

  // Add outcome banner
  if (success) {
    if (hasHandledErrors) {
      if (manualReviewCount > 0) {
        core.summary.addRaw(
          `> **Status:** ⚠️ Completed with handled triage errors (${handledErrorCount}) and manual review required (${manualReviewCount})\n\n`,
          true
        )
      } else {
        core.summary.addRaw(
          `> **Status:** ⚠️ Completed with handled triage errors (${handledErrorCount})\n\n`,
          true
        )
      }
    } else if (hasManualReviewOnly) {
      core.summary.addRaw(
        `> **Status:** ⚠️ Completed with manual review required (${manualReviewCount})\n\n`,
        true
      )
    } else {
      core.summary.addRaw('> **Status:** ✅ Completed successfully\n\n', true)
    }
  } else {
    core.summary.addRaw('> **Status:** ❌ Completed with errors\n\n', true)
  }

  // Build the stages table
  if (tracking) {
    const stages = [
      { field: 'find_status' as keyof RunProcessTracking, name: 'find' },
      {
        field: 'reconcile_status' as keyof RunProcessTracking,
        name: 'reconcile'
      },
      { field: 'triage_status' as keyof RunProcessTracking, name: 'triage' },
      {
        field: 'remediation_validation_loop_status' as keyof RunProcessTracking,
        name: 'remediation_loop'
      },
      { field: 'push_status' as keyof RunProcessTracking, name: 'push' }
    ]

    const tableData: Array<Array<{ data: string; header?: boolean }>> = [
      [
        { data: 'Stage', header: true },
        { data: 'Status', header: true },
        { data: 'Details', header: true }
      ]
    ]

    for (const { field, name } of stages) {
      const status = tracking[field]
      const displayName = getDisplayName(name)
      const icon = getStatusIcon(status?.status)
      const statusText = getStatusText(status?.status)
      const details = formatSummaryDetails(name, status, summary)

      tableData.push([
        { data: displayName },
        { data: `${icon} ${statusText}` },
        { data: details }
      ])
    }

    core.summary.addTable(tableData)
  }

  // Add summary metrics if available
  if (summary) {
    core.summary.addHeading('Key Metrics', 3)
    const taxonomy = getRunTaxonomy(summary)
    const customerVisiblePrCount = getCustomerVisiblePrCount(summary)

    const metricsData: Array<Array<{ data: string; header?: boolean }>> = [
      [
        { data: 'Metric', header: true },
        { data: 'Value', header: true }
      ]
    ]

    // Vulnerability counts
    metricsData.push([
      { data: 'Total Vulnerabilities' },
      { data: summary.total_vulnerabilities.toString() }
    ])
    metricsData.push([
      { data: 'True Positives' },
      { data: summary.true_positives.toString() }
    ])
    metricsData.push([
      { data: 'False Positives' },
      { data: summary.false_positives.toString() }
    ])
    if ((summary.needs_manual_review_count ?? 0) > 0) {
      metricsData.push([
        { data: 'Manual Review Required' },
        { data: (summary.needs_manual_review_count ?? 0).toString() }
      ])
    }
    if ((summary.handled_error_count ?? 0) > 0) {
      metricsData.push([
        { data: 'Handled Errors (Admin Review)' },
        { data: (summary.handled_error_count ?? 0).toString() }
      ])
    }
    if (taxonomy.vendorExcluded > 0) {
      metricsData.push([
        { data: 'Vendor/Excluded Findings' },
        { data: taxonomy.vendorExcluded.toString() }
      ])
    }
    if (taxonomy.duplicates > 0) {
      metricsData.push([
        { data: 'Scanner-Correlated/Deduplicated Findings' },
        { data: taxonomy.duplicates.toString() }
      ])
    }

    // Remediation
    if (summary.remediation_success + summary.remediation_failed > 0) {
      metricsData.push([
        { data: 'Remediation Success' },
        { data: summary.remediation_success.toString() }
      ])
      metricsData.push([
        { data: 'Remediation Failed' },
        { data: summary.remediation_failed.toString() }
      ])
    }
    if (taxonomy.scopeFailures > 0) {
      metricsData.push([
        { data: 'Remediation Scope Validation Failures' },
        { data: taxonomy.scopeFailures.toString() }
      ])
    }
    if (taxonomy.validationFailures > 0) {
      metricsData.push([
        { data: 'Remediation Validation Failures' },
        { data: taxonomy.validationFailures.toString() }
      ])
    }
    if (taxonomy.remediationUnitFailures > 0) {
      metricsData.push([
        { data: 'Remediation Unit Failures' },
        { data: taxonomy.remediationUnitFailures.toString() }
      ])
    }
    if (taxonomy.pushFailures > 0) {
      metricsData.push([
        { data: 'GitHub Push/API Failures' },
        { data: taxonomy.pushFailures.toString() }
      ])
    }

    // PRs
    if (customerVisiblePrCount > 0) {
      metricsData.push([
        { data: 'Pull Requests Created' },
        { data: customerVisiblePrCount.toString() }
      ])
    } else if (hasTypedNoPrReason(summary)) {
      metricsData.push([
        { data: 'Pull Requests Created' },
        { data: `0 (${formatNoCustomerPrReason(summary).replace(/^ - /, '')})` }
      ])
    }

    // Issues - display context-aware metrics
    if ((summary.issue_count ?? 0) > 0) {
      const validationWarningCount = summary.issues_validation_warning ?? 0
      const multistepCweCount = summary.issues_multistep_cwe ?? 0

      if (validationWarningCount > 0) {
        metricsData.push([
          {
            data: 'Issues Created (Security Passed, Functional/Quality Checks Failed)'
          },
          { data: validationWarningCount.toString() }
        ])
      }

      if (multistepCweCount > 0) {
        metricsData.push([
          {
            data: 'Issues Created (Validation Passed, Additional Steps Required)'
          },
          { data: multistepCweCount.toString() }
        ])
      }

      // Fallback for backwards compatibility
      if (validationWarningCount === 0 && multistepCweCount === 0) {
        metricsData.push([
          {
            data: 'Issues Created (Security Passed, Functional/Quality Checks Failed)'
          },
          { data: (summary.issue_count ?? 0).toString() }
        ])
      }
    }

    core.summary.addTable(metricsData)

    // Add CWE breakdown if available
    if (Object.keys(summary.cwe_breakdown).length > 0) {
      core.summary.addHeading('CWE Distribution', 4)
      const cweData: Array<Array<{ data: string; header?: boolean }>> = [
        [
          { data: 'CWE', header: true },
          { data: 'Count', header: true }
        ]
      ]
      const sortedCwes = Object.entries(summary.cwe_breakdown).sort(
        (a, b) => b[1] - a[1]
      )
      for (const [cwe, count] of sortedCwes) {
        cweData.push([{ data: cwe }, { data: count.toString() }])
      }
      core.summary.addTable(cweData)
    }

    // Add severity breakdown if available
    if (Object.keys(summary.severity_breakdown).length > 0) {
      core.summary.addHeading('Severity Distribution', 4)
      const sevData: Array<Array<{ data: string; header?: boolean }>> = [
        [
          { data: 'Severity', header: true },
          { data: 'Count', header: true }
        ]
      ]
      const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
      const sortedSeverities = Object.entries(summary.severity_breakdown).sort(
        (a, b) => {
          const indexA = severityOrder.indexOf(a[0].toLowerCase())
          const indexB = severityOrder.indexOf(b[0].toLowerCase())
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
        }
      )
      for (const [severity, count] of sortedSeverities) {
        const capitalizedSeverity =
          severity.charAt(0).toUpperCase() + severity.slice(1)
        sevData.push([
          { data: capitalizedSeverity },
          { data: count.toString() }
        ])
      }
      core.summary.addTable(sevData)
    }

    // Add PR links if available (show as table with titles)
    if (summary.pr_urls.length > 0) {
      core.summary.addHeading('Pull Requests & Issues', 4)

      const prTableData: Array<Array<{ data: string; header?: boolean }>> = [
        [
          { data: 'Type', header: true },
          { data: 'ID', header: true },
          { data: 'Title', header: true }
        ]
      ]

      for (const prUrl of summary.pr_urls) {
        const title = prTitles?.get(prUrl) || ''
        const parsed = parsePrUrl(prUrl)
        let type = 'PR'
        let idDisplay = prUrl

        if (parsed) {
          if (prUrl.includes('/issues/')) type = 'Issue'
          idDisplay = `<a href="${prUrl}">#${parsed.number}</a>`
        } else {
          idDisplay = `<a href="${prUrl}">Link</a>`
        }

        prTableData.push([{ data: type }, { data: idDisplay }, { data: title }])
      }
      core.summary.addTable(prTableData)
    }

    // Add Issue links if available (from failed validations)
    if ((summary.issue_urls ?? []).length > 0) {
      core.summary.addHeading('GitHub Issues', 4)
      for (const issueUrl of summary.issue_urls ?? []) {
        const title = issueTitles?.get(issueUrl)
        if (title) {
          core.summary.addRaw(`- ${issueUrl} (${title})\n`, true)
        } else {
          core.summary.addRaw(`- ${issueUrl}\n`, true)
        }
      }
    }
  }

  // Add grouping configuration if enabled
  if (groupingConfig?.enabled) {
    core.summary.addHeading('Grouping Configuration', 3)

    const strategyDisplayNames: Record<string, string> = {
      cwe_category: 'CWE Category',
      file_proximity: 'File Proximity',
      module: 'Module',
      smart: 'Smart (AI-powered)'
    }

    const stageDisplayNames: Record<string, string> = {
      pre_push: 'Pre-Push',
      pre_remediation: 'Pre-Remediation'
    }

    const groupingData: Array<Array<{ data: string; header?: boolean }>> = [
      [
        { data: 'Setting', header: true },
        { data: 'Value', header: true }
      ],
      [
        { data: 'Strategy' },
        {
          data:
            strategyDisplayNames[groupingConfig.strategy] ||
            groupingConfig.strategy
        }
      ],
      [
        { data: 'Max Vulnerabilities Per PR' },
        { data: groupingConfig.maxVulnerabilitiesPerPr.toString() }
      ],
      [
        { data: 'Stage' },
        {
          data: stageDisplayNames[groupingConfig.stage] || groupingConfig.stage
        }
      ]
    ]

    core.summary.addTable(groupingData)
  }

  // Add run metadata
  core.summary.addRaw('\n---\n\n', true)
  core.summary.addRaw(`**Run ID:** \`${runId || 'N/A'}\`\n\n`, true)
  core.summary.addRaw(`**Duration:** ${durationStr}\n`, true)

  // Add dashboard link if available
  if (dashboardUrl) {
    core.summary.addRaw('\n', true)
    core.summary.addLink('View detailed results on the dashboard', dashboardUrl)
    core.summary.addRaw('\n', true)
  }

  // Write the summary
  await core.summary.write()
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
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

/**
 * Format vulnerability summary with counts and percentages
 */
export function formatVulnerabilitySummary(summary: RunSummary): string {
  const total = summary.total_vulnerabilities
  if (total === 0) {
    return 'No vulnerabilities found'
  }
  const manualReviewCount = summary.needs_manual_review_count ?? 0

  const tpPercent = ((summary.true_positives / total) * 100).toFixed(1)
  const fpPercent = ((summary.false_positives / total) * 100).toFixed(1)
  const mrPercent = ((manualReviewCount / total) * 100).toFixed(1)

  const lines = [
    `Total: ${total}`,
    `├─ True Positives: ${summary.true_positives} (${tpPercent}%)`,
    `├─ False Positives: ${summary.false_positives} (${fpPercent}%)`
  ]
  if (manualReviewCount > 0) {
    lines.push(
      `└─ Manual Review Required: ${manualReviewCount} (${mrPercent}%)`
    )
  } else {
    lines.push('└─ Manual Review Required: 0 (0.0%)')
  }
  return lines.join('\n')
}

/**
 * Format CWE breakdown with counts
 */
export function formatCweBreakdown(
  cweBreakdown: Record<string, number>
): string {
  const entries = Object.entries(cweBreakdown).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    return 'No CWE data available'
  }

  const lines: string[] = []
  entries.forEach(([cwe, count], index) => {
    const isLast = index === entries.length - 1
    const prefix = isLast ? '└─' : '├─'
    lines.push(`${prefix} ${cwe}: ${count}`)
  })

  return lines.join('\n')
}

/**
 * Format severity distribution with color coding
 */
export function formatSeverityDistribution(
  severityBreakdown: Record<string, number>
): string {
  const entries = Object.entries(severityBreakdown)
  if (entries.length === 0) {
    return 'No severity data available'
  }

  // Sort by standard severity order
  const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
  const sorted = entries.sort((a, b) => {
    const indexA = severityOrder.indexOf(a[0].toLowerCase())
    const indexB = severityOrder.indexOf(b[0].toLowerCase())
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
  })

  const lines: string[] = []
  sorted.forEach(([severity, count], index) => {
    const isLast = index === sorted.length - 1
    const prefix = isLast ? '└─' : '├─'
    const capitalizedSeverity =
      severity.charAt(0).toUpperCase() + severity.slice(1)
    lines.push(`${prefix} ${capitalizedSeverity}: ${count}`)
  })

  return lines.join('\n')
}

/**
 * Format remediation results with success/failure counts and validation metrics
 * @param summary The run summary with metrics
 * @param remediationStatus Optional ProcessStatus from remediation loop for detailed metrics
 */
export function formatRemediationResults(
  summary: RunSummary,
  remediationStatus?: ProcessStatus
): string {
  const total = summary.remediation_success + summary.remediation_failed
  if (total === 0) {
    return 'No remediation attempts'
  }

  const successPercent = ((summary.remediation_success / total) * 100).toFixed(
    1
  )

  const lines: string[] = [
    `Total Attempts: ${total}`,
    `├─ Successful: ${summary.remediation_success} (${successPercent}%)`
  ]

  // Add detailed metrics from remediation status if available
  if (remediationStatus) {
    const contextCount =
      remediationStatus.additional_context_required_count || 0
    const warningCount = remediationStatus.self_validation_warning_count || 0
    const failureCount = remediationStatus.self_validation_failure_count || 0
    const scopeFailureCount =
      remediationStatus.scope_validation_failure_count || 0

    // Only show if at least one of these counts is > 0
    if (
      contextCount > 0 ||
      warningCount > 0 ||
      failureCount > 0 ||
      scopeFailureCount > 0
    ) {
      if (contextCount > 0) {
        lines.push(`├─ Need Additional Context: ${contextCount}`)
      }
      if (warningCount > 0) {
        lines.push(
          `├─ Security-Passed Warnings: ${warningCount} (functional/quality checks failed)`
        )
      }
      if (failureCount > 0) {
        lines.push(`├─ Skipped (Security Not Resolved): ${failureCount}`)
      }
      if (scopeFailureCount > 0) {
        lines.push(`├─ Scope Validation Failures: ${scopeFailureCount}`)
      }
    }
  }

  const taxonomy = getRunTaxonomy(summary)
  if (taxonomy.internalNonPushedAttempts > 0) {
    lines.push(
      `├─ Internal Non-Pushed Attempts: ${taxonomy.internalNonPushedAttempts}`
    )
  }
  if (taxonomy.pushFailures > 0) {
    lines.push(`├─ GitHub Push/API Failures: ${taxonomy.pushFailures}`)
  }

  lines.push(`└─ Failed: ${summary.remediation_failed}`)

  return lines.join('\n')
}

/**
 * Format PR links (show all PRs without truncation)
 * @param prUrls List of PR URLs
 * @param prTitles Optional map of PR URL to title
 */
export function formatPrLinks(
  prUrls: string[],
  prTitles?: Map<string, string>
): string {
  if (prUrls.length === 0) {
    return 'No pull requests created'
  }

  const lines: string[] = []

  for (let i = 0; i < prUrls.length; i++) {
    const isLast = i === prUrls.length - 1
    const prefix = isLast ? '└─' : '├─'
    const url = prUrls[i]
    const title = prTitles?.get(url)

    if (title) {
      lines.push(`${prefix} ${url} (${title})`)
    } else {
      lines.push(`${prefix} ${url}`)
    }
  }

  return lines.join('\n')
}

/**
 * Format GitHub Issue links (created from failed validations)
 */
export function formatIssueLinks(
  issueUrls: string[],
  issueTitles?: Map<string, string>
): string {
  if (issueUrls.length === 0) {
    return 'No issues created'
  }

  const lines: string[] = []

  for (let i = 0; i < issueUrls.length; i++) {
    const isLast = i === issueUrls.length - 1
    const prefix = isLast ? '└─' : '├─'
    const url = issueUrls[i]
    const title = issueTitles?.get(url)
    if (title) {
      lines.push(`${prefix} ${url} (${title})`)
    } else {
      lines.push(`${prefix} ${url}`)
    }
  }

  return lines.join('\n')
}

/**
 * Format final results with actionable metrics
 * @param summary The run summary with metrics
 * @param runId The run ID
 * @param durationMs Duration in milliseconds
 * @param tracking Optional process tracking for detailed remediation metrics
 * @param prTitles Optional map of PR URL to title
 * @param dashboardUrl Optional dashboard URL to display at bottom
 * @param groupingConfig Optional grouping configuration to display
 * @param issueTitles Optional map of issue URL to title
 * @returns Formatted output string
 */
export function formatFinalResults(
  summary: RunSummary | null,
  runId: string | null,
  durationMs: number,
  tracking?: RunProcessTracking | null,
  prTitles?: Map<string, string>,
  dashboardUrl?: string,
  groupingConfig?: GroupingConfig,
  issueTitles?: Map<string, string>
): string {
  const lines: string[] = []
  const durationStr = formatDuration(durationMs)

  // Add branding at the top
  lines.push('')
  lines.push(getConsoleBranding())
  lines.push('')
  lines.push(
    '╔═══════════════════════════════════════════════════════════════╗'
  )
  lines.push(
    '║                      Final Results                            ║'
  )
  lines.push(
    '╚═══════════════════════════════════════════════════════════════╝'
  )
  lines.push('')
  lines.push(`Run ID: ${runId || 'N/A'}`)
  lines.push(`Duration: ${durationStr}`)
  lines.push('')

  if (!summary) {
    lines.push('Summary data not available')
    return lines.join('\n')
  }

  // Vulnerability Summary
  lines.push('┌─ Vulnerability Summary')
  const vulnLines = formatVulnerabilitySummary(summary).split('\n')
  vulnLines.forEach((line) => lines.push(`│  ${line}`))
  lines.push('│')

  const handledErrorCount = summary.handled_error_count ?? 0
  const manualReviewCount = summary.needs_manual_review_count ?? 0
  const taxonomy = getRunTaxonomy(summary)
  if (handledErrorCount > 0 || manualReviewCount > 0) {
    lines.push('├─ Triage Attention')
    lines.push(`│  ├─ Handled Errors: ${handledErrorCount}`)
    lines.push(`│  └─ Manual Review Required: ${manualReviewCount}`)
    lines.push('│')
  }

  const taxonomyLines = formatTaxonomyItems(summary, {
    includeExpectedTriage: true,
    includePushFailures: true
  })
  if (taxonomyLines.length > 0) {
    lines.push('├─ Outcome Breakdown')
    taxonomyLines.forEach((line, index) => {
      const prefix = index === taxonomyLines.length - 1 ? '└─' : '├─'
      lines.push(`│  ${prefix} ${line}`)
    })
    lines.push('│')
  }

  // CWE Breakdown
  if (Object.keys(summary.cwe_breakdown).length > 0) {
    lines.push('├─ CWE Breakdown')
    const cweLines = formatCweBreakdown(summary.cwe_breakdown).split('\n')
    cweLines.forEach((line) => lines.push(`│  ${line}`))
    lines.push('│')
  }

  // Severity Distribution
  if (Object.keys(summary.severity_breakdown).length > 0) {
    lines.push('├─ Severity Distribution')
    const sevLines = formatSeverityDistribution(
      summary.severity_breakdown
    ).split('\n')
    sevLines.forEach((line) => lines.push(`│  ${line}`))
    lines.push('│')
  }

  // Remediation Results
  if (summary.remediation_success + summary.remediation_failed > 0) {
    lines.push('├─ Remediation Results')
    const remediationStatus = tracking?.remediation_validation_loop_status
    const remLines = formatRemediationResults(summary, remediationStatus).split(
      '\n'
    )
    remLines.forEach((line) => lines.push(`│  ${line}`))
    lines.push('│')
  }

  // Pull Requests
  const customerVisiblePrCount = getCustomerVisiblePrCount(summary)
  if (customerVisiblePrCount > 0) {
    lines.push(`├─ Pull Requests (${customerVisiblePrCount})`)
    const prLines = formatPrLinks(summary.pr_urls, prTitles).split('\n')
    prLines.forEach((line) => lines.push(`│  ${line}`))
    lines.push('│')
  } else if (hasTypedNoPrReason(summary)) {
    lines.push('├─ Pull Requests (0)')
    lines.push(
      `│  No customer-visible PRs created${formatNoCustomerPrReason(summary)}`
    )
    if (taxonomy.internalNonPushedAttempts > 0) {
      lines.push(
        `│  Internal non-pushed attempts: ${taxonomy.internalNonPushedAttempts}`
      )
    }
    lines.push('│')
  }

  // GitHub Issues (created from failed validations)
  if ((summary.issue_count ?? 0) > 0) {
    lines.push(`├─ GitHub Issues (${summary.issue_count})`)
    const issueLines = formatIssueLinks(
      summary.issue_urls ?? [],
      issueTitles
    ).split('\n')
    issueLines.forEach((line) => lines.push(`│  ${line}`))
    lines.push('│')
  }

  // Grouping Configuration
  if (groupingConfig?.enabled) {
    lines.push('├─ Grouping Configuration')
    lines.push(`│  Strategy: ${groupingConfig.strategy}`)
    lines.push(
      `│  Max Vulnerabilities Per PR: ${groupingConfig.maxVulnerabilitiesPerPr}`
    )
    lines.push(`│  Stage: ${groupingConfig.stage}`)
  }

  lines.push('└─────────────────────────────────────────────────────────────')

  if (dashboardUrl) {
    lines.push('')
    lines.push(`View detailed results on the dashboard: ${dashboardUrl}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Log run summary to console with formatted output.
 * Used when finalizing a run to display summary metrics.
 * @param summary The run summary with metrics
 * @param prTitles Optional map of PR URL to title
 * @param dashboardUrl Optional dashboard URL to display
 * @param issueTitles Optional map of issue URL to title
 */
export function logSummary(
  summary: RunSummary,
  prTitles?: Map<string, string>,
  dashboardUrl?: string,
  issueTitles?: Map<string, string>
): void {
  const prefixLabel = `[${LogLabels.RUN_SUMMARY}]`

  core.info(`${prefixLabel}: === Run Summary ===`)
  core.info(
    `${prefixLabel}: Total vulnerabilities: ${summary.total_vulnerabilities}`
  )
  core.info(`${prefixLabel}: True positives: ${summary.true_positives}`)
  core.info(`${prefixLabel}: False positives: ${summary.false_positives}`)
  const manualReviewCount = summary.needs_manual_review_count ?? 0
  const handledErrorCount = summary.handled_error_count ?? 0
  const taxonomy = getRunTaxonomy(summary)

  if (manualReviewCount > 0) {
    core.warning(`${prefixLabel}: Manual review required: ${manualReviewCount}`)
  }
  if (handledErrorCount > 0) {
    core.warning(
      `${prefixLabel}: Handled errors (admin review recommended): ${handledErrorCount}`
    )
  }
  core.info(
    `${prefixLabel}: Remediation: ${summary.remediation_success} successful, ${summary.remediation_failed} failed`
  )
  core.info(
    `${prefixLabel}: PRs created: ${getCustomerVisiblePrCount(summary)}`
  )
  for (const item of formatTaxonomyItems(summary, {
    includeExpectedTriage: true,
    includePushFailures: true
  })) {
    core.info(`${prefixLabel}: ${item}`)
  }
  if (taxonomy.internalNonPushedFindings > 0) {
    core.info(
      `${prefixLabel}: Internal non-pushed findings: ${taxonomy.internalNonPushedFindings}`
    )
  }

  if (summary.pr_urls.length > 0) {
    core.info(`${prefixLabel}: PR URLs:`)
    for (const url of summary.pr_urls) {
      const title = prTitles?.get(url)
      if (title) {
        core.info(`${prefixLabel}:   - ${url} (${title})`)
      } else {
        core.info(`${prefixLabel}:   - ${url}`)
      }
    }
  }

  if ((summary.issue_count ?? 0) > 0) {
    const validationWarningCount = summary.issues_validation_warning ?? 0
    const multistepCweCount = summary.issues_multistep_cwe ?? 0

    // Display specific messages for each issue type
    if (validationWarningCount > 0) {
      core.info(
        `${prefixLabel}: Issues created: ${validationWarningCount} (security passed, functional/quality checks failed)`
      )
    }

    if (multistepCweCount > 0) {
      core.info(
        `${prefixLabel}: Issues created: ${multistepCweCount} (validation passed, additional steps required)`
      )
    }

    // Fallback for backwards compatibility: if new fields not present, use old behavior
    if (validationWarningCount === 0 && multistepCweCount === 0) {
      core.info(
        `${prefixLabel}: Issues created: ${summary.issue_count} (security passed, functional/quality checks failed)`
      )
    }

    for (const url of summary.issue_urls ?? []) {
      const title = issueTitles?.get(url)
      if (title) {
        core.info(`${prefixLabel}:   - ${url} (${title})`)
      } else {
        core.info(`${prefixLabel}:   - ${url}`)
      }
    }
  }

  if ((summary.skipped_count ?? 0) > 0) {
    core.info(
      `${prefixLabel}: Skipped: ${summary.skipped_count} (security not resolved)`
    )
  }

  if (dashboardUrl) {
    core.info(`${prefixLabel}: Dashboard: ${dashboardUrl}`)
  }

  core.info(`${prefixLabel}: ===================`)
}
