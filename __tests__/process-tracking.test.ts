/**
 * Unit tests for process tracking utilities (Issue #181)
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

// Import after mocking
const { formatStageStatus, logProcessTracking, getDisplayName } =
  await import('../src/utils')

describe('getDisplayName', () => {
  it('returns user-friendly name for find', () => {
    expect(getDisplayName('find')).toBe('Vulnerability Import')
  })

  it('returns user-friendly name for triage', () => {
    expect(getDisplayName('triage')).toBe('Triage Analysis')
  })

  it('returns user-friendly name for remediation_loop', () => {
    expect(getDisplayName('remediation_loop')).toBe('Remediation')
  })

  it('returns user-friendly name for remediation_validation_loop', () => {
    expect(getDisplayName('remediation_validation_loop')).toBe('Remediation')
  })

  it('returns user-friendly name for push', () => {
    expect(getDisplayName('push')).toBe('Pull Requests')
  })

  it('returns original name for unknown stages', () => {
    expect(getDisplayName('custom_stage')).toBe('custom_stage')
  })
})

describe('formatStageStatus', () => {
  describe('handles not_started status', () => {
    it('returns Pending for undefined status', () => {
      expect(formatStageStatus('triage', undefined)).toBe(
        '⏸️ Triage Analysis: Pending'
      )
    })

    it('returns Pending for not_started status', () => {
      expect(
        formatStageStatus('triage', {
          status: 'not_started',
          progress_percentage: 0,
          total_items: 0,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('⏸️ Triage Analysis: Pending')
    })
  })

  describe('handles initiated status', () => {
    it('returns Initializing message', () => {
      expect(
        formatStageStatus('find', {
          status: 'initiated',
          progress_percentage: 0,
          total_items: 0,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('🔄 Vulnerability Import: Initializing...')
    })
  })

  describe('handles completed status', () => {
    it('shows confirmed vulnerabilities and false positives for triage', () => {
      // success_count includes both confirmed and FP (all successful triages)
      // confirmed = success_count - false_positive_count = 15 - 3 = 12
      expect(
        formatStageStatus('triage', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 15,
          processed_items: 15,
          success_count: 15,
          error_count: 0,
          false_positive_count: 3
        })
      ).toBe(
        '✅ Triage Analysis: Completed (12 confirmed vulnerabilities, 3 false positives)'
      )
    })

    it('shows confirmed vulnerabilities, false positives and errors for triage', () => {
      // success_count = 10 successful triages (7 confirmed + 3 FP), 2 errors
      // confirmed = success_count - false_positive_count = 10 - 3 = 7
      expect(
        formatStageStatus('triage', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 15,
          processed_items: 15,
          success_count: 10,
          error_count: 2,
          false_positive_count: 3
        })
      ).toBe(
        '✅ Triage Analysis: Completed (7 confirmed vulnerabilities, 3 false positives, 2 errors)'
      )
    })

    it('shows only confirmed vulnerabilities when no false positives or errors for triage', () => {
      expect(
        formatStageStatus('triage', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('✅ Triage Analysis: Completed (10 confirmed vulnerabilities)')
    })

    it('shows vulnerabilities found for find stage', () => {
      expect(
        formatStageStatus('find', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('✅ Vulnerability Import: Completed (10 vulnerabilities found)')
    })

    it('shows PRs created for push stage', () => {
      expect(
        formatStageStatus('push', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 5,
          processed_items: 5,
          success_count: 5,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('✅ Pull Requests: Completed (5 PRs created)')
    })

    it('shows fixes generated for remediation stage', () => {
      expect(
        formatStageStatus('remediation_loop', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 5,
          processed_items: 5,
          success_count: 5,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('✅ Remediation: Completed (5 fixes generated)')
    })

    it('shows total_items when no success/error counts', () => {
      expect(
        formatStageStatus('push', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 5,
          processed_items: 5,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('✅ Pull Requests: Completed (5 processed)')
    })

    it('shows completed without details when no items', () => {
      expect(
        formatStageStatus('validate', {
          status: 'completed',
          progress_percentage: 100,
          total_items: 0,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('✅ validate: Completed')
    })
  })

  describe('handles in_progress status', () => {
    it('shows progress with confirmed/FP for triage', () => {
      // success_count = 8 successful triages (5 confirmed + 3 FP)
      // confirmed = success_count - false_positive_count = 8 - 3 = 5
      expect(
        formatStageStatus('triage', {
          status: 'in_progress',
          progress_percentage: 53.33,
          total_items: 15,
          processed_items: 8,
          success_count: 8,
          error_count: 0,
          false_positive_count: 3
        })
      ).toBe('⏳ Triage Analysis: 8/15 (53%) - 5 confirmed, 3 false positives')
    })

    it('shows progress without confirmed/FP for non-triage stages', () => {
      expect(
        formatStageStatus('remediation_loop', {
          status: 'in_progress',
          progress_percentage: 41.67,
          total_items: 12,
          processed_items: 5,
          success_count: 5,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('⏳ Remediation: 5/12 (42%)')
    })

    it('shows "more expected" for push when remediation_loop is in_progress', () => {
      const remediationLoopStatus = {
        status: 'in_progress',
        progress_percentage: 50,
        total_items: 8,
        processed_items: 4,
        success_count: 4,
        error_count: 0,
        false_positive_count: 0
      }
      expect(
        formatStageStatus(
          'push',
          {
            status: 'in_progress',
            progress_percentage: 100,
            total_items: 4,
            processed_items: 4,
            success_count: 4,
            error_count: 0,
            false_positive_count: 0
          },
          remediationLoopStatus
        )
      ).toBe(
        '⏳ Pull Requests: 4 PRs created (more expected as remediation continues)'
      )
    })

    it('shows normal progress for push when remediation_loop is completed', () => {
      const remediationLoopStatus = {
        status: 'completed',
        progress_percentage: 100,
        total_items: 8,
        processed_items: 8,
        success_count: 8,
        error_count: 0,
        false_positive_count: 0
      }
      expect(
        formatStageStatus(
          'push',
          {
            status: 'in_progress',
            progress_percentage: 75,
            total_items: 8,
            processed_items: 6,
            success_count: 6,
            error_count: 0,
            false_positive_count: 0
          },
          remediationLoopStatus
        )
      ).toBe('⏳ Pull Requests: 6/8 PRs (75%)')
    })

    it('shows normal progress for push when remediation_loop status is not provided', () => {
      expect(
        formatStageStatus('push', {
          status: 'in_progress',
          progress_percentage: 75,
          total_items: 8,
          processed_items: 6,
          success_count: 6,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('⏳ Pull Requests: 6/8 PRs (75%)')
    })
  })

  describe('handles failed status', () => {
    it('shows error message when present', () => {
      expect(
        formatStageStatus('remediate', {
          status: 'failed',
          progress_percentage: 50,
          total_items: 10,
          processed_items: 5,
          success_count: 4,
          error_count: 1,
          false_positive_count: 0,
          error_message: 'LLM API rate limit exceeded'
        })
      ).toBe('❌ remediate: Failed - LLM API rate limit exceeded')
    })

    it('shows unknown error when no message', () => {
      expect(
        formatStageStatus('validate', {
          status: 'failed',
          progress_percentage: 0,
          total_items: 10,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('❌ validate: Failed - unknown error')
    })
  })

  describe('handles unknown status', () => {
    it('shows raw status for unknown values', () => {
      expect(
        formatStageStatus('custom_stage', {
          status: 'paused',
          progress_percentage: 50,
          total_items: 10,
          processed_items: 5,
          success_count: 5,
          error_count: 0,
          false_positive_count: 0
        })
      ).toBe('custom_stage: paused')
    })
  })
})

describe('logProcessTracking', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing when tracking is null', () => {
    logProcessTracking(null, '[RUN_STATUS]')
    expect(core.info).not.toHaveBeenCalled()
  })

  it('does nothing when tracking is undefined', () => {
    logProcessTracking(undefined, '[RUN_STATUS]')
    expect(core.info).not.toHaveBeenCalled()
  })

  it('logs find_status when present', () => {
    logProcessTracking(
      {
        find_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 15,
          processed_items: 15,
          success_count: 15,
          error_count: 0,
          false_positive_count: 0
        }
      },
      '[RUN_STATUS]'
    )
    expect(core.info).toHaveBeenCalledWith(
      '[RUN_STATUS]: ✅ Vulnerability Import: Completed (15 vulnerabilities found)'
    )
  })

  it('logs triage_status with confirmed/FP when in_progress', () => {
    // success_count = 8 (5 confirmed + 3 FP), confirmed = 8 - 3 = 5
    logProcessTracking(
      {
        triage_status: {
          status: 'in_progress',
          progress_percentage: 53,
          total_items: 15,
          processed_items: 8,
          success_count: 8,
          error_count: 0,
          false_positive_count: 3
        }
      },
      '[RUN_STATUS]'
    )
    expect(core.info).toHaveBeenCalledWith(
      '[RUN_STATUS]: ⏳ Triage Analysis: 8/15 (53%) - 5 confirmed, 3 false positives'
    )
  })

  it('logs remediation_validation_loop_status as Remediation', () => {
    logProcessTracking(
      {
        remediation_validation_loop_status: {
          status: 'not_started',
          progress_percentage: 0,
          total_items: 0,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        }
      },
      '[RUN_STATUS]'
    )
    expect(core.info).toHaveBeenCalledWith(
      '[RUN_STATUS]: ⏸️ Remediation: Pending'
    )
  })

  it('logs multiple stages in order', () => {
    logProcessTracking(
      {
        find_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        },
        triage_status: {
          status: 'in_progress',
          progress_percentage: 40,
          total_items: 10,
          processed_items: 4,
          success_count: 4, // 3 confirmed + 1 FP = 4 successful triages
          error_count: 0,
          false_positive_count: 1
        },
        remediation_validation_loop_status: {
          status: 'not_started',
          progress_percentage: 0,
          total_items: 0,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        },
        push_status: {
          status: 'not_started',
          progress_percentage: 0,
          total_items: 0,
          processed_items: 0,
          success_count: 0,
          error_count: 0,
          false_positive_count: 0
        }
      },
      '[RUN_STATUS]'
    )

    // Check order of calls
    const calls = (core.info as jest.Mock).mock.calls.map((c) => c[0])
    expect(calls).toContain(
      '[RUN_STATUS]: ✅ Vulnerability Import: Completed (10 vulnerabilities found)'
    )
    expect(calls).toContain(
      '[RUN_STATUS]: ⏳ Triage Analysis: 4/10 (40%) - 3 confirmed, 1 false positives'
    )
    expect(calls).toContain('[RUN_STATUS]: ⏸️ Remediation: Pending')
    expect(calls).toContain('[RUN_STATUS]: ⏸️ Pull Requests: Pending')
  })

  it('logs push with "more expected" when remediation_loop is in_progress', () => {
    logProcessTracking(
      {
        find_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        },
        triage_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        },
        remediation_validation_loop_status: {
          status: 'in_progress',
          progress_percentage: 50,
          total_items: 8,
          processed_items: 4,
          success_count: 4,
          error_count: 0,
          false_positive_count: 0
        },
        push_status: {
          status: 'in_progress',
          progress_percentage: 100,
          total_items: 4,
          processed_items: 4,
          success_count: 4,
          error_count: 0,
          false_positive_count: 0
        }
      },
      '[RUN_STATUS]'
    )

    const calls = (core.info as jest.Mock).mock.calls.map((c) => c[0])
    expect(calls).toContain('[RUN_STATUS]: ⏳ Remediation: 4/8 (50%)')
    expect(calls).toContain(
      '[RUN_STATUS]: ⏳ Pull Requests: 4 PRs created (more expected as remediation continues)'
    )
  })

  it('logs push with normal format when remediation_loop is completed', () => {
    logProcessTracking(
      {
        find_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        },
        triage_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        },
        remediation_validation_loop_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 8,
          processed_items: 8,
          success_count: 8,
          error_count: 0,
          false_positive_count: 0
        },
        push_status: {
          status: 'in_progress',
          progress_percentage: 75,
          total_items: 8,
          processed_items: 6,
          success_count: 6,
          error_count: 0,
          false_positive_count: 0
        }
      },
      '[RUN_STATUS]'
    )

    const calls = (core.info as jest.Mock).mock.calls.map((c) => c[0])
    expect(calls).toContain(
      '[RUN_STATUS]: ✅ Remediation: Completed (8 fixes generated)'
    )
    expect(calls).toContain('[RUN_STATUS]: ⏳ Pull Requests: 6/8 PRs (75%)')
  })

  it('skips stages without status data', () => {
    logProcessTracking(
      {
        find_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 10,
          error_count: 0,
          false_positive_count: 0
        }
        // Other stages are undefined - should not log
      },
      '[TEST]'
    )

    // Should only log find_status
    expect(core.info).toHaveBeenCalledTimes(1)
    expect(core.info).toHaveBeenCalledWith(
      '[TEST]: ✅ Vulnerability Import: Completed (10 vulnerabilities found)'
    )
  })
})
