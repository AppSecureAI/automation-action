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
  formatDuration
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

    it('truncates list at 5 PRs', () => {
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
      expect(result).toContain('https://github.com/org/repo/pull/1')
      expect(result).toContain('https://github.com/org/repo/pull/5')
      expect(result).not.toContain('https://github.com/org/repo/pull/6')
      expect(result).toContain('...and 2 more')
    })

    it('uses correct tree characters for truncated list', () => {
      const urls = Array.from(
        { length: 7 },
        (_, i) => `https://github.com/org/repo/pull/${i + 1}`
      )
      const result = formatPrLinks(urls)
      const lines = result.split('\n')
      expect(lines[lines.length - 1]).toContain('└─ ...and 2 more')
    })
  })

  describe('formatFinalResults', () => {
    it('handles null summary gracefully', () => {
      const result = formatFinalResults(null, 'run-123', 60000)
      expect(result).toContain('AppSecAI - Final Results')
      expect(result).toContain('Run ID: run-123')
      expect(result).toContain('Duration: 1m')
      expect(result).toContain('Summary data not available')
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
      expect(result).toContain('AppSecAI - Final Results')
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
})
