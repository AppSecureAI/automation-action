// src/utils.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import {
  ProcessStatusValue,
  type ProcessStatus,
  type RunProcessTracking,
  type RunSummary
} from './types.js'
import { LogLabels } from './constants.js'

/**
 * Mapping of internal stage names to user-friendly display names
 */
export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  find: 'Vulnerability Import',
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

/**
 * Logs steps with appropriate logging level based on status
 * @param steps Array of steps to log
 * @param apiContext Optional string to indicate which API call these steps are related to
 */
export function logSteps(
  steps: Array<{ name: string; status: string; detail: string }>,
  apiContext?: string
) {
  steps.forEach((step) => {
    const logFunction = step.status === 'completed' ? core.info : core.error
    const prefix = apiContext ? `[${apiContext}] ` : ''
    logFunction(`${prefix}------ ${step.name} ------`)
    logFunction(`${prefix}status: [${step.status}]`)
    logFunction(`${prefix}detail: [${step.detail}]`)
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
  remediationLoopStatus?: ProcessStatus
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
      const truePositives =
        status.success_count - (status.false_positive_count || 0)
      if (truePositives > 0) {
        details.push(`${truePositives} confirmed vulnerabilities`)
      }
      if (status.false_positive_count > 0) {
        details.push(`${status.false_positive_count} false positives`)
      }
    } else if (name === 'push') {
      // For push, show PRs created
      if (status.success_count > 0) {
        details.push(`${status.success_count} PRs created`)
      }
    } else if (name === 'find') {
      // For find/scan, show vulnerabilities found
      if (status.success_count > 0) {
        details.push(`${status.success_count} vulnerabilities found`)
      }
    } else if (
      name === 'remediation_loop' ||
      name === 'remediation_validation_loop'
    ) {
      // For remediation loop, show success count and validation metrics
      if (status.success_count > 0) {
        details.push(`${status.success_count} fixes generated`)
      }
      // Show self-validation warning count (security passed but other checks failed)
      const warningCount = status.self_validation_warning_count || 0
      if (warningCount > 0) {
        details.push(`${warningCount} with warnings`)
      }
      // Show self-validation failure count (validation prevented PR creation)
      const failureCount = status.self_validation_failure_count || 0
      if (failureCount > 0) {
        details.push(`${failureCount} validation failures`)
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
      const falsePos = status.false_positive_count || 0
      const truePos = (status.success_count || 0) - falsePos
      return `${STATUS_ICONS.in_progress} ${displayName}: ${status.processed_items}/${status.total_items} (${pct}%) - ${truePos} confirmed, ${falsePos} false positives`
    }
    // Special handling for push/PRs when remediation is still in progress
    if (
      name === 'push' &&
      remediationLoopStatus?.status === ProcessStatusValue.IN_PROGRESS
    ) {
      return `${STATUS_ICONS.in_progress} ${displayName}: ${status.processed_items} PRs created (more expected as remediation continues)`
    }
    // For push, use PR terminology
    if (name === 'push') {
      return `${STATUS_ICONS.in_progress} ${displayName}: ${status.processed_items}/${status.total_items} PRs (${pct}%)`
    }
    return `${STATUS_ICONS.in_progress} ${displayName}: ${status.processed_items}/${status.total_items} (${pct}%)`
  }

  if (status.status === ProcessStatusValue.FAILED) {
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
  prefixLabel: string
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
      const formatted = formatStageStatus(name, status, remediationLoopStatus)
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
function formatSummaryDetails(name: string, status?: ProcessStatus): string {
  if (!status) {
    return '-'
  }

  if (name === 'triage') {
    const truePos = status.success_count - (status.false_positive_count || 0)
    const falsePos = status.false_positive_count || 0
    if (truePos > 0 || falsePos > 0) {
      return `${truePos} confirmed, ${falsePos} false positives`
    }
  } else if (name === 'push') {
    if (status.success_count > 0) {
      return `${status.success_count} PRs created`
    }
  } else if (name === 'find') {
    if (status.success_count > 0) {
      return `${status.success_count} vulnerabilities`
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
    const warningCount = status.self_validation_warning_count || 0
    if (warningCount > 0) {
      parts.push(`${warningCount} warnings`)
    }
    const failureCount = status.self_validation_failure_count || 0
    if (failureCount > 0) {
      parts.push(`${failureCount} val. failures`)
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
 */
export async function writeJobSummary(
  tracking: RunProcessTracking | null | undefined,
  summary: RunSummary | null,
  runId: string | null,
  durationMs: number,
  success: boolean
): Promise<void> {
  const durationStr = formatDuration(durationMs)

  // Start building the summary
  core.summary.addHeading('AppSecAI Results', 2)

  // Add outcome banner
  if (success) {
    core.summary.addRaw('> **Status:** ✅ Completed successfully\n\n', true)
  } else {
    core.summary.addRaw('> **Status:** ❌ Completed with errors\n\n', true)
  }

  // Build the stages table
  if (tracking) {
    const stages = [
      { field: 'find_status' as keyof RunProcessTracking, name: 'find' },
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
      const details = formatSummaryDetails(name, status)

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

    // PRs
    if (summary.pr_count > 0) {
      metricsData.push([
        { data: 'Pull Requests Created' },
        { data: summary.pr_count.toString() }
      ])
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

    // Add PR links if available (show all PRs without truncation)
    if (summary.pr_urls.length > 0) {
      core.summary.addHeading('Pull Requests', 4)
      for (const prUrl of summary.pr_urls) {
        core.summary.addRaw(`- ${prUrl}\n`, true)
      }
    }
  }

  // Add run metadata
  core.summary.addRaw('\n---\n\n', true)
  core.summary.addRaw(`**Run ID:** \`${runId || 'N/A'}\`\n\n`, true)
  core.summary.addRaw(`**Duration:** ${durationStr}\n`, true)

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

  const tpPercent = ((summary.true_positives / total) * 100).toFixed(1)
  const fpPercent = ((summary.false_positives / total) * 100).toFixed(1)

  return [
    `Total: ${total}`,
    `├─ True Positives: ${summary.true_positives} (${tpPercent}%)`,
    `└─ False Positives: ${summary.false_positives} (${fpPercent}%)`
  ].join('\n')
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
 * Format remediation results with success/failure counts
 */
export function formatRemediationResults(summary: RunSummary): string {
  const total = summary.remediation_success + summary.remediation_failed
  if (total === 0) {
    return 'No remediation attempts'
  }

  const successPercent = ((summary.remediation_success / total) * 100).toFixed(
    1
  )

  return [
    `Total Attempts: ${total}`,
    `├─ Successful: ${summary.remediation_success} (${successPercent}%)`,
    `└─ Failed: ${summary.remediation_failed}`
  ].join('\n')
}

/**
 * Format PR links (show all PRs without truncation)
 */
export function formatPrLinks(prUrls: string[]): string {
  if (prUrls.length === 0) {
    return 'No pull requests created'
  }

  const lines: string[] = []

  for (let i = 0; i < prUrls.length; i++) {
    const isLast = i === prUrls.length - 1
    const prefix = isLast ? '└─' : '├─'
    lines.push(`${prefix} ${prUrls[i]}`)
  }

  return lines.join('\n')
}

/**
 * Format final results with actionable metrics
 * @param summary The run summary with metrics
 * @param runId The run ID
 * @param durationMs Duration in milliseconds
 * @returns Formatted output string
 */
export function formatFinalResults(
  summary: RunSummary | null,
  runId: string | null,
  durationMs: number
): string {
  const lines: string[] = []
  const durationStr = formatDuration(durationMs)

  lines.push(
    '╔═══════════════════════════════════════════════════════════════╗'
  )
  lines.push(
    '║              AppSecAI - Final Results                         ║'
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
    const remLines = formatRemediationResults(summary).split('\n')
    remLines.forEach((line) => lines.push(`│  ${line}`))
    lines.push('│')
  }

  // Pull Requests
  if (summary.pr_count > 0) {
    lines.push(`├─ Pull Requests (${summary.pr_count})`)
    const prLines = formatPrLinks(summary.pr_urls).split('\n')
    prLines.forEach((line) => lines.push(`│  ${line}`))
  }

  lines.push('└─────────────────────────────────────────────────────────────')

  return lines.join('\n')
}

/**
 * Log run summary to console with formatted output.
 * Used when finalizing a run to display summary metrics.
 * @param summary The run summary with metrics
 */
export function logSummary(summary: RunSummary): void {
  const prefixLabel = `[${LogLabels.RUN_SUMMARY}]`

  core.info(`${prefixLabel}: === Run Summary ===`)
  core.info(
    `${prefixLabel}: Total vulnerabilities: ${summary.total_vulnerabilities}`
  )
  core.info(`${prefixLabel}: True positives: ${summary.true_positives}`)
  core.info(`${prefixLabel}: False positives: ${summary.false_positives}`)
  core.info(`${prefixLabel}: PRs created: ${summary.pr_count}`)

  if (summary.pr_urls.length > 0) {
    core.info(`${prefixLabel}: PR URLs:`)
    for (const url of summary.pr_urls) {
      core.info(`${prefixLabel}:   - ${url}`)
    }
  }

  core.info(`${prefixLabel}: ===================`)
}
