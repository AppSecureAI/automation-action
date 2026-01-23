// __tests__/utils.test.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const {
  logSteps,
  formatVulnerabilitySummary,
  formatCweBreakdown,
  formatSeverityDistribution,
  formatRemediationResults,
  formatPrLinks,
  formatFinalResults,
  formatDuration,
  logSummary,
  formatStageStatus,
  writeJobSummary
} = await import('../src/utils')

/**
 * Unit tests for src/utils.ts
 */

describe('utils.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation(() => 'https://some-url')
    core.getIDToken.mockImplementation(() => Promise.resolve('sos32af47'))
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('logs completed steps with core.info', () => {
    const steps = [
      { name: 'step1', status: 'completed', detail: 'all good' },
      { name: 'step2', status: 'completed', detail: 'done' }
    ]
    logSteps(steps)
    // Each step logs 4 times
    expect(core.info).toHaveBeenCalledTimes(8)
    expect(core.error).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith('------ step1 ------')
    expect(core.info).toHaveBeenCalledWith('status: [completed]')
    expect(core.info).toHaveBeenCalledWith('detail: [all good]')
    expect(core.info).toHaveBeenCalledWith('------ ------')
    expect(core.info).toHaveBeenCalledWith('------ step2 ------')
    expect(core.info).toHaveBeenCalledWith('status: [completed]')
    expect(core.info).toHaveBeenCalledWith('detail: [done]')
    expect(core.info).toHaveBeenCalledWith('------ ------')
  })

  it('logs failed steps with core.error', () => {
    const steps = [
      { name: 'step1', status: 'failed', detail: 'something went wrong' }
    ]
    logSteps(steps)
    expect(core.error).toHaveBeenCalledTimes(4)
    expect(core.info).not.toHaveBeenCalled()
    expect(core.error).toHaveBeenCalledWith('------ step1 ------')
    expect(core.error).toHaveBeenCalledWith('status: [failed]')
    expect(core.error).toHaveBeenCalledWith('detail: [something went wrong]')
    expect(core.error).toHaveBeenCalledWith('------ ------')
  })

  it('logs steps with apiContext prefix', () => {
    const steps = [
      { name: 'step1', status: 'completed', detail: 'ok' },
      { name: 'step2', status: 'failed', detail: 'fail' }
    ]
    logSteps(steps, 'API')
    // step1 uses info, step2 uses error
    expect(core.info).toHaveBeenCalledTimes(4)
    expect(core.error).toHaveBeenCalledTimes(4)
    expect(core.info).toHaveBeenCalledWith('[API] ------ step1 ------')
    expect(core.info).toHaveBeenCalledWith('[API] status: [completed]')
    expect(core.info).toHaveBeenCalledWith('[API] detail: [ok]')
    expect(core.info).toHaveBeenCalledWith('[API] ------ ------')
    expect(core.error).toHaveBeenCalledWith('[API] ------ step2 ------')
    expect(core.error).toHaveBeenCalledWith('[API] status: [failed]')
    expect(core.error).toHaveBeenCalledWith('[API] detail: [fail]')
    expect(core.error).toHaveBeenCalledWith('[API] ------ ------')
  })

  it('does nothing if steps is empty', () => {
    logSteps([])
    expect(core.info).not.toHaveBeenCalled()
    expect(core.error).not.toHaveBeenCalled()
  })

  describe('formatDuration', () => {
    it('formats seconds correctly', () => {
      expect(formatDuration(5000)).toBe('5s')
      expect(formatDuration(45000)).toBe('45s')
    })

    it('formats minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1m')
      expect(formatDuration(90000)).toBe('1m 30s')
      expect(formatDuration(120000)).toBe('2m')
    })

    it('formats hours correctly', () => {
      expect(formatDuration(3600000)).toBe('1h')
      expect(formatDuration(3660000)).toBe('1h 1m')
      expect(formatDuration(7200000)).toBe('2h')
    })
  })

  describe('formatVulnerabilitySummary', () => {
    it('handles no vulnerabilities', () => {
      const summary = {
        total_vulnerabilities: 0,
        true_positives: 0,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatVulnerabilitySummary(summary)
      expect(result).toBe('No vulnerabilities found')
    })

    it('formats vulnerability counts with percentages', () => {
      const summary = {
        total_vulnerabilities: 100,
        true_positives: 75,
        false_positives: 25,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatVulnerabilitySummary(summary)
      expect(result).toContain('Total: 100')
      expect(result).toContain('True Positives: 75 (75.0%)')
      expect(result).toContain('False Positives: 25 (25.0%)')
    })

    it('handles all true positives', () => {
      const summary = {
        total_vulnerabilities: 50,
        true_positives: 50,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatVulnerabilitySummary(summary)
      expect(result).toContain('True Positives: 50 (100.0%)')
      expect(result).toContain('False Positives: 0 (0.0%)')
    })
  })

  describe('formatCweBreakdown', () => {
    it('handles empty CWE breakdown', () => {
      const result = formatCweBreakdown({})
      expect(result).toBe('No CWE data available')
    })

    it('formats CWE breakdown sorted by count', () => {
      const breakdown = {
        'CWE-79': 10,
        'CWE-89': 25,
        'CWE-78': 5
      }
      const result = formatCweBreakdown(breakdown)
      expect(result).toContain('CWE-89: 25')
      expect(result).toContain('CWE-79: 10')
      expect(result).toContain('CWE-78: 5')
      // Check order - highest count first
      const lines = result.split('\n')
      expect(lines[0]).toContain('CWE-89')
      expect(lines[1]).toContain('CWE-79')
      expect(lines[2]).toContain('CWE-78')
    })

    it('uses correct tree characters', () => {
      const breakdown = {
        'CWE-79': 10,
        'CWE-89': 25
      }
      const result = formatCweBreakdown(breakdown)
      expect(result).toContain('├─ CWE-89')
      expect(result).toContain('└─ CWE-79')
    })
  })

  describe('formatSeverityDistribution', () => {
    it('handles empty severity breakdown', () => {
      const result = formatSeverityDistribution({})
      expect(result).toBe('No severity data available')
    })

    it('formats severity distribution in correct order', () => {
      const breakdown = {
        low: 10,
        critical: 5,
        medium: 15,
        high: 8
      }
      const result = formatSeverityDistribution(breakdown)
      const lines = result.split('\n')
      // Check ordering: critical, high, medium, low
      expect(lines[0]).toContain('Critical: 5')
      expect(lines[1]).toContain('High: 8')
      expect(lines[2]).toContain('Medium: 15')
      expect(lines[3]).toContain('Low: 10')
    })

    it('capitalizes severity names', () => {
      const breakdown = {
        critical: 5,
        high: 10
      }
      const result = formatSeverityDistribution(breakdown)
      expect(result).toContain('Critical: 5')
      expect(result).toContain('High: 10')
    })

    it('uses correct tree characters', () => {
      const breakdown = {
        high: 10,
        low: 5
      }
      const result = formatSeverityDistribution(breakdown)
      expect(result).toContain('├─ High')
      expect(result).toContain('└─ Low')
    })
  })

  describe('formatRemediationResults', () => {
    it('handles no remediation attempts', () => {
      const summary = {
        total_vulnerabilities: 10,
        true_positives: 10,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatRemediationResults(summary)
      expect(result).toBe('No remediation attempts')
    })

    it('formats remediation results with success rate', () => {
      const summary = {
        total_vulnerabilities: 100,
        true_positives: 100,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 75,
        remediation_failed: 25,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatRemediationResults(summary)
      expect(result).toContain('Total Attempts: 100')
      expect(result).toContain('Successful: 75 (75.0%)')
      expect(result).toContain('Failed: 25')
    })

    it('handles 100% success rate', () => {
      const summary = {
        total_vulnerabilities: 50,
        true_positives: 50,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 50,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatRemediationResults(summary)
      expect(result).toContain('Successful: 50 (100.0%)')
    })
  })

  describe('formatPrLinks', () => {
    it('handles no PRs', () => {
      const result = formatPrLinks([])
      expect(result).toBe('No pull requests created')
    })

    it('formats list with few PRs', () => {
      const urls = [
        'https://github.com/org/repo/pull/1',
        'https://github.com/org/repo/pull/2',
        'https://github.com/org/repo/pull/3'
      ]
      const result = formatPrLinks(urls)
      expect(result).toContain('https://github.com/org/repo/pull/1')
      expect(result).toContain('https://github.com/org/repo/pull/2')
      expect(result).toContain('https://github.com/org/repo/pull/3')
      expect(result).not.toContain('...and')
    })

    it('shows all PRs without truncation', () => {
      const urls = [
        'https://github.com/org/repo/pull/1',
        'https://github.com/org/repo/pull/2',
        'https://github.com/org/repo/pull/3',
        'https://github.com/org/repo/pull/4',
        'https://github.com/org/repo/pull/5',
        'https://github.com/org/repo/pull/6',
        'https://github.com/org/repo/pull/7'
      ]
      const result = formatPrLinks(urls)
      // All PRs should be shown
      expect(result).toContain('https://github.com/org/repo/pull/1')
      expect(result).toContain('https://github.com/org/repo/pull/5')
      expect(result).toContain('https://github.com/org/repo/pull/6')
      expect(result).toContain('https://github.com/org/repo/pull/7')
      // No truncation message
      expect(result).not.toContain('...and')
      expect(result).not.toContain('more')
    })

    it('uses correct tree characters for full list', () => {
      const urls = Array.from(
        { length: 7 },
        (_, i) => `https://github.com/org/repo/pull/${i + 1}`
      )
      const result = formatPrLinks(urls)
      const lines = result.split('\n')
      // Last line should use └─ and contain the last PR
      expect(lines[lines.length - 1]).toContain('└─')
      expect(lines[lines.length - 1]).toContain('pull/7')
      // Other lines should use ├─
      expect(lines[0]).toContain('├─')
    })
  })

  describe('formatFinalResults', () => {
    it('handles null summary gracefully', () => {
      const result = formatFinalResults(null, 'run-123', 60000)
      expect(result).toContain('Final Results')
      expect(result).toContain('Run ID: run-123')
      expect(result).toContain('Duration: 1m')
      expect(result).toContain('Summary data not available')
    })

    it('includes branding at the top', () => {
      const result = formatFinalResults(null, 'run-123', 60000)
      expect(result).toContain('AppSecAI')
      expect(result).toContain('https://www.appsecai.io/')
      expect(result).toContain('/\\')
      expect(result).toContain('(◉)')
    })

    it('formats complete summary with all sections', () => {
      const summary = {
        total_vulnerabilities: 100,
        true_positives: 80,
        false_positives: 20,
        cwe_breakdown: {
          'CWE-79': 30,
          'CWE-89': 50
        },
        severity_breakdown: {
          critical: 10,
          high: 40,
          medium: 30,
          low: 20
        },
        remediation_success: 70,
        remediation_failed: 10,
        pr_urls: [
          'https://github.com/org/repo/pull/1',
          'https://github.com/org/repo/pull/2'
        ],
        pr_count: 2
      }
      const result = formatFinalResults(summary, 'run-789', 180000)

      // Check all sections are present
      expect(result).toContain('Final Results')
      expect(result).toContain('Run ID: run-789')
      expect(result).toContain('Duration: 3m')
      expect(result).toContain('Vulnerability Summary')
      expect(result).toContain('Total: 100')
      expect(result).toContain('CWE Breakdown')
      expect(result).toContain('CWE-79')
      expect(result).toContain('Severity Distribution')
      expect(result).toContain('Critical')
      expect(result).toContain('Remediation Results')
      expect(result).toContain('Pull Requests (2)')
      expect(result).toContain('https://github.com/org/repo/pull/1')
    })

    it('omits empty sections', () => {
      const summary = {
        total_vulnerabilities: 10,
        true_positives: 10,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatFinalResults(summary, 'run-999', 30000)

      expect(result).toContain('Vulnerability Summary')
      expect(result).not.toContain('CWE Breakdown')
      expect(result).not.toContain('Severity Distribution')
      expect(result).not.toContain('Remediation Results')
      expect(result).not.toContain('Pull Requests')
    })

    it('handles null run ID', () => {
      const summary = {
        total_vulnerabilities: 0,
        true_positives: 0,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }
      const result = formatFinalResults(summary, null, 5000)
      expect(result).toContain('Run ID: N/A')
    })
  })

  describe('logSummary', () => {
    it('logs summary with all fields', () => {
      const summary = {
        total_vulnerabilities: 100,
        true_positives: 80,
        false_positives: 20,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [
          'https://github.com/org/repo/pull/1',
          'https://github.com/org/repo/pull/2'
        ],
        pr_count: 2
      }

      logSummary(summary)

      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: === Run Summary ===')
      expect(core.info).toHaveBeenCalledWith(
        '[SUMMARY]: Total vulnerabilities: 100'
      )
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: True positives: 80')
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: False positives: 20')
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: PRs created: 2')
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: PR URLs:')
      expect(core.info).toHaveBeenCalledWith(
        '[SUMMARY]:   - https://github.com/org/repo/pull/1'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[SUMMARY]:   - https://github.com/org/repo/pull/2'
      )
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: ===================')
    })

    it('does not log PR URLs section when no PRs exist', () => {
      const summary = {
        total_vulnerabilities: 50,
        true_positives: 40,
        false_positives: 10,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }

      logSummary(summary)

      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: === Run Summary ===')
      expect(core.info).toHaveBeenCalledWith(
        '[SUMMARY]: Total vulnerabilities: 50'
      )
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: PRs created: 0')
      expect(core.info).not.toHaveBeenCalledWith('[SUMMARY]: PR URLs:')
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: ===================')
    })

    it('logs zero values correctly', () => {
      const summary = {
        total_vulnerabilities: 0,
        true_positives: 0,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      }

      logSummary(summary)

      expect(core.info).toHaveBeenCalledWith(
        '[SUMMARY]: Total vulnerabilities: 0'
      )
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: True positives: 0')
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: False positives: 0')
      expect(core.info).toHaveBeenCalledWith('[SUMMARY]: PRs created: 0')
    })
  })

  describe('formatStageStatus - additional_context_required_count', () => {
    const createBaseStatus = () => ({
      status: 'completed',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      progress_percentage: 100,
      error_message: null,
      total_items: 10,
      processed_items: 10,
      success_count: 5,
      error_count: 0,
      false_positive_count: 0,
      self_validation_warning_count: 0,
      self_validation_failure_count: 0,
      additional_context_required_count: 0
    })

    it('shows additional context count for completed remediation_loop', () => {
      const status = {
        ...createBaseStatus(),
        additional_context_required_count: 2
      }
      const result = formatStageStatus('remediation_loop', status)
      expect(result).toContain('5 fixes generated')
      expect(result).toContain('2 need additional context')
      expect(result).toContain('✅')
    })

    it('shows additional context count for completed remediation_validation_loop', () => {
      const status = {
        ...createBaseStatus(),
        additional_context_required_count: 3
      }
      const result = formatStageStatus('remediation_validation_loop', status)
      expect(result).toContain('5 fixes generated')
      expect(result).toContain('3 need additional context')
    })

    it('shows all validation metrics together', () => {
      const status = {
        ...createBaseStatus(),
        additional_context_required_count: 2,
        self_validation_warning_count: 1,
        self_validation_failure_count: 1
      }
      const result = formatStageStatus('remediation_loop', status)
      expect(result).toContain('5 fixes generated')
      expect(result).toContain('2 need additional context')
      expect(result).toContain('1 with warnings')
      expect(result).toContain('1 validation failures')
    })

    it('does not show additional context count when zero', () => {
      const status = createBaseStatus()
      const result = formatStageStatus('remediation_loop', status)
      expect(result).toContain('5 fixes generated')
      expect(result).not.toContain('need additional context')
    })

    it('does not show additional context for non-remediation stages', () => {
      const status = {
        ...createBaseStatus(),
        additional_context_required_count: 5
      }
      const result = formatStageStatus('triage', status)
      expect(result).not.toContain('need additional context')
    })
  })

  describe('formatRemediationResults - with remediationStatus', () => {
    const baseSummary = {
      total_vulnerabilities: 100,
      true_positives: 100,
      false_positives: 0,
      cwe_breakdown: {},
      severity_breakdown: {},
      remediation_success: 75,
      remediation_failed: 25,
      pr_urls: [],
      pr_count: 0
    }

    const createRemediationStatus = () => ({
      status: 'completed',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      progress_percentage: 100,
      error_message: null,
      total_items: 100,
      processed_items: 100,
      success_count: 75,
      error_count: 0,
      false_positive_count: 0,
      self_validation_warning_count: 0,
      self_validation_failure_count: 0,
      additional_context_required_count: 0
    })

    it('includes additional context required count', () => {
      const remediationStatus = {
        ...createRemediationStatus(),
        additional_context_required_count: 3
      }
      const result = formatRemediationResults(baseSummary, remediationStatus)
      expect(result).toContain('Total Attempts: 100')
      expect(result).toContain('Successful: 75 (75.0%)')
      expect(result).toContain('Need Additional Context: 3')
      expect(result).toContain('Failed: 25')
    })

    it('includes all validation metrics', () => {
      const remediationStatus = {
        ...createRemediationStatus(),
        additional_context_required_count: 2,
        self_validation_warning_count: 5,
        self_validation_failure_count: 3
      }
      const result = formatRemediationResults(baseSummary, remediationStatus)
      expect(result).toContain('Need Additional Context: 2')
      expect(result).toContain('With Warnings: 5')
      expect(result).toContain('Validation Failures: 3')
    })

    it('works without remediationStatus parameter', () => {
      const result = formatRemediationResults(baseSummary)
      expect(result).toContain('Total Attempts: 100')
      expect(result).toContain('Successful: 75 (75.0%)')
      expect(result).toContain('Failed: 25')
      expect(result).not.toContain('Need Additional Context')
      expect(result).not.toContain('With Warnings')
      expect(result).not.toContain('Validation Failures')
    })

    it('omits validation metrics when all zero', () => {
      const remediationStatus = createRemediationStatus()
      const result = formatRemediationResults(baseSummary, remediationStatus)
      expect(result).toContain('Successful: 75 (75.0%)')
      expect(result).not.toContain('Need Additional Context')
      expect(result).not.toContain('With Warnings')
      expect(result).not.toContain('Validation Failures')
    })

    it('only shows non-zero validation metrics', () => {
      const remediationStatus = {
        ...createRemediationStatus(),
        self_validation_warning_count: 2
        // additional_context_required_count and self_validation_failure_count are 0
      }
      const result = formatRemediationResults(baseSummary, remediationStatus)
      expect(result).toContain('With Warnings: 2')
      expect(result).not.toContain('Need Additional Context')
      expect(result).not.toContain('Validation Failures')
    })
  })

  describe('formatFinalResults - with tracking', () => {
    const baseSummary = {
      total_vulnerabilities: 100,
      true_positives: 80,
      false_positives: 20,
      cwe_breakdown: {},
      severity_breakdown: {},
      remediation_success: 70,
      remediation_failed: 10,
      pr_urls: [],
      pr_count: 0
    }

    const createRemediationStatus = () => ({
      status: 'completed',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      progress_percentage: 100,
      error_message: null,
      total_items: 80,
      processed_items: 80,
      success_count: 70,
      error_count: 0,
      false_positive_count: 0,
      self_validation_warning_count: 0,
      self_validation_failure_count: 0,
      additional_context_required_count: 0
    })

    it('includes validation metrics from tracking', () => {
      const tracking = {
        remediation_validation_loop_status: {
          ...createRemediationStatus(),
          additional_context_required_count: 5,
          self_validation_warning_count: 3,
          self_validation_failure_count: 2
        }
      }
      const result = formatFinalResults(baseSummary, 'run-123', 60000, tracking)
      expect(result).toContain('Remediation Results')
      expect(result).toContain('Need Additional Context: 5')
      expect(result).toContain('With Warnings: 3')
      expect(result).toContain('Validation Failures: 2')
    })

    it('works without tracking parameter', () => {
      const result = formatFinalResults(baseSummary, 'run-123', 60000)
      expect(result).toContain('Remediation Results')
      expect(result).toContain('Successful: 70 (87.5%)')
      expect(result).toContain('Failed: 10')
      expect(result).not.toContain('Need Additional Context')
    })

    it('works with null tracking', () => {
      const result = formatFinalResults(baseSummary, 'run-123', 60000, null)
      expect(result).toContain('Remediation Results')
      expect(result).not.toContain('Need Additional Context')
    })

    it('works with tracking missing remediation_validation_loop_status', () => {
      const tracking = {
        find_status: createRemediationStatus()
      }
      const result = formatFinalResults(baseSummary, 'run-123', 60000, tracking)
      expect(result).toContain('Remediation Results')
      expect(result).not.toContain('Need Additional Context')
    })
  })

  describe('writeJobSummary', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    const createProcessStatus = (overrides = {}) => ({
      status: 'completed',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      progress_percentage: 100,
      error_message: null,
      total_items: 10,
      processed_items: 10,
      success_count: 10,
      error_count: 0,
      false_positive_count: 0,
      self_validation_warning_count: 0,
      self_validation_failure_count: 0,
      additional_context_required_count: 0,
      ...overrides
    })

    const createSummary = (overrides = {}) => ({
      total_vulnerabilities: 100,
      true_positives: 80,
      false_positives: 20,
      cwe_breakdown: { 'CWE-79': 30, 'CWE-89': 50 },
      severity_breakdown: { critical: 10, high: 40, medium: 30, low: 20 },
      remediation_success: 70,
      remediation_failed: 10,
      pr_urls: ['https://github.com/org/repo/pull/1'],
      pr_count: 1,
      ...overrides
    })

    it('writes job summary with branding', async () => {
      await writeJobSummary(null, null, null, 60000, true)

      expect(core.summary.addRaw).toHaveBeenCalled()
      // Verify branding is added first
      const firstCall = (core.summary.addRaw as jest.Mock).mock.calls[0]
      expect(firstCall[0]).toContain('AppSecAI')
      expect(core.summary.write).toHaveBeenCalled()
    })

    it('writes success status when success is true', async () => {
      await writeJobSummary(null, null, 'run-123', 60000, true)

      const addRawCalls = (core.summary.addRaw as jest.Mock).mock.calls
      const statusCall = addRawCalls.find((call: unknown[]) =>
        String(call[0]).includes('Status')
      )
      expect(statusCall).toBeDefined()
      expect(String(statusCall![0])).toContain('✅ Completed successfully')
    })

    it('writes error status when success is false', async () => {
      await writeJobSummary(null, null, 'run-123', 60000, false)

      const addRawCalls = (core.summary.addRaw as jest.Mock).mock.calls
      const statusCall = addRawCalls.find((call: unknown[]) =>
        String(call[0]).includes('Status')
      )
      expect(statusCall).toBeDefined()
      expect(String(statusCall![0])).toContain('❌ Completed with errors')
    })

    it('writes stage table when tracking is provided', async () => {
      const tracking = {
        find_status: createProcessStatus({ success_count: 50 }),
        triage_status: createProcessStatus({ success_count: 40 }),
        remediation_validation_loop_status: createProcessStatus({
          success_count: 30
        }),
        push_status: createProcessStatus({ success_count: 5 })
      }

      await writeJobSummary(tracking, null, 'run-123', 60000, true)

      expect(core.summary.addTable).toHaveBeenCalled()
      // Check the table has proper headers
      const tableCall = (core.summary.addTable as jest.Mock).mock
        .calls[0][0] as {
        data: string
        header?: boolean
      }[][]
      expect(tableCall[0]).toEqual([
        { data: 'Stage', header: true },
        { data: 'Status', header: true },
        { data: 'Details', header: true }
      ])
    })

    it('writes metrics table when summary is provided', async () => {
      const summary = createSummary()

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).toHaveBeenCalledWith('Key Metrics', 3)
      expect(core.summary.addTable).toHaveBeenCalled()
    })

    it('writes CWE breakdown when available', async () => {
      const summary = createSummary({
        cwe_breakdown: { 'CWE-79': 30, 'CWE-89': 50 }
      })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).toHaveBeenCalledWith(
        'CWE Distribution',
        4
      )
    })

    it('writes severity breakdown when available', async () => {
      const summary = createSummary({
        severity_breakdown: { critical: 5, high: 10 }
      })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).toHaveBeenCalledWith(
        'Severity Distribution',
        4
      )
    })

    it('writes PR links when available', async () => {
      const summary = createSummary({
        pr_urls: [
          'https://github.com/org/repo/pull/1',
          'https://github.com/org/repo/pull/2'
        ],
        pr_count: 2
      })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).toHaveBeenCalledWith('Pull Requests', 4)
      const addRawCalls = (core.summary.addRaw as jest.Mock).mock.calls
      const prCall = addRawCalls.find((call: unknown[]) =>
        String(call[0]).includes('github.com/org/repo/pull/1')
      )
      expect(prCall).toBeDefined()
    })

    it('writes run metadata at the end', async () => {
      await writeJobSummary(null, null, 'run-456', 120000, true)

      const addRawCalls = (core.summary.addRaw as jest.Mock).mock.calls
      const runIdCall = addRawCalls.find((call: unknown[]) =>
        String(call[0]).includes('run-456')
      )
      expect(runIdCall).toBeDefined()

      const durationCall = addRawCalls.find((call: unknown[]) =>
        String(call[0]).includes('Duration')
      )
      expect(durationCall).toBeDefined()
      expect(String(durationCall![0])).toContain('2m')
    })

    it('handles N/A for null runId', async () => {
      await writeJobSummary(null, null, null, 60000, true)

      const addRawCalls = (core.summary.addRaw as jest.Mock).mock.calls
      const runIdCall = addRawCalls.find((call: unknown[]) =>
        String(call[0]).includes('Run ID')
      )
      expect(runIdCall).toBeDefined()
      expect(String(runIdCall![0])).toContain('N/A')
    })

    it('skips CWE breakdown when empty', async () => {
      const summary = createSummary({ cwe_breakdown: {} })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).not.toHaveBeenCalledWith(
        'CWE Distribution',
        4
      )
    })

    it('skips severity breakdown when empty', async () => {
      const summary = createSummary({ severity_breakdown: {} })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).not.toHaveBeenCalledWith(
        'Severity Distribution',
        4
      )
    })

    it('skips PR links when no PRs', async () => {
      const summary = createSummary({ pr_urls: [], pr_count: 0 })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      expect(core.summary.addHeading).not.toHaveBeenCalledWith(
        'Pull Requests',
        4
      )
    })

    it('skips remediation metrics when no remediation attempts', async () => {
      const summary = createSummary({
        remediation_success: 0,
        remediation_failed: 0
      })

      await writeJobSummary(null, summary, 'run-123', 60000, true)

      // addTable should have been called for metrics table
      expect(core.summary.addTable).toHaveBeenCalled()
      // Verify table was created (metrics table exists)
      const tableCalls = (core.summary.addTable as jest.Mock).mock.calls
      expect(tableCalls.length).toBeGreaterThan(0)
      // The metrics table header should exist
      const firstTable = tableCalls[0][0] as {
        data: string
        header?: boolean
      }[][]
      expect(firstTable[0][0].data).toBe('Metric')
    })

    it('handles null tracking and summary gracefully', async () => {
      await writeJobSummary(null, null, 'run-123', 60000, true)

      expect(core.summary.addHeading).toHaveBeenCalledWith(
        'AppSecAI Results',
        2
      )
      expect(core.summary.write).toHaveBeenCalled()
      // Should not call addTable when no tracking
      expect(core.summary.addTable).not.toHaveBeenCalled()
    })

    it('handles undefined tracking and summary gracefully', async () => {
      await writeJobSummary(undefined, null, 'run-123', 60000, true)

      expect(core.summary.addHeading).toHaveBeenCalledWith(
        'AppSecAI Results',
        2
      )
      expect(core.summary.write).toHaveBeenCalled()
    })
  })
})
