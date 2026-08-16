/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'
import {
  fileExists,
  readFile,
  readInputFiles,
  resolveInputFilePaths
} from '../__fixtures__/file'
import { fetchPrTitles, parsePrUrl } from '../__fixtures__/titles'
import {
  submitRun,
  getStatus,
  pollStatusUntilComplete,
  finalizeRun
} from '../__fixtures__/service'
import store from '../src/store'
// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/file', () => ({
  fileExists,
  readFile,
  readInputFiles,
  resolveInputFilePaths
}))
jest.unstable_mockModule('../src/service', () => ({
  submitRun,
  getStatus,
  pollStatusUntilComplete,
  finalizeRun
}))
jest.unstable_mockModule('../src/titles', () => ({
  fetchPrTitles,
  parsePrUrl
}))
// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run, buildPausedMessage } = await import('../src/main')

describe('main.ts', () => {
  beforeEach(() => {
    delete process.env.PROCESSING_MODE
    delete process.env.INPUT_API_URL
    delete process.env.INPUT_TOKEN
    delete process.env.ALLOW_LONG_RUN_HANDOFF
    delete process.env.INPUT_ALLOW_LONG_RUN_HANDOFF
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name: string) => {
      if (name === 'file') return 'some_file.json'
      if (name === 'files') return ''
      return ''
    })
    readFile.mockImplementation((filePath: string) => {
      const jsonData = JSON.stringify({ key: filePath })
      const inputBuffer = Buffer.from(jsonData)
      return Promise.resolve(inputBuffer)
    })
    resolveInputFilePaths.mockImplementation((file: string, files: string) =>
      (files || file)
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
    readInputFiles.mockImplementation(async (filePaths: string[]) =>
      Promise.all(
        filePaths.map(async (filePath) => ({
          path: filePath,
          buffer: await readFile(filePath)
        }))
      )
    )
    submitRun.mockImplementation(() =>
      Promise.resolve({
        message: 'This was the received file: some_file.json',
        run_id: 'run-12345'
      })
    )
    getStatus.mockImplementation(() =>
      Promise.resolve({
        status: 'completed',
        processTracking: null,
        summary: null
      })
    )
    pollStatusUntilComplete.mockImplementation(() =>
      Promise.resolve({ status: 'completed' })
    )
    finalizeRun.mockImplementation(() => Promise.resolve(null))
    fetchPrTitles.mockResolvedValue(new Map())
    // Reset store state
    store.id = ''
  })

  afterEach(() => {
    jest.resetAllMocks()
    // Reset store state after each test
    store.id = ''
  })

  describe('success cases', () => {
    it('should set the message output when processing completes successfully', async () => {
      await run()

      // Verify the message output was set.
      expect(core.setOutput).toHaveBeenNthCalledWith(
        1,
        'message',
        expect.stringMatching(/Processing completed successfully/)
      )
    })

    it('should set terminal run evidence outputs when processing completes successfully', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'completed',
          dashboard_url: 'https://dashboard.example.test/runs/run-12345',
          processTracking: null,
          summary: null
        })
      )

      await run()

      expect(core.setOutput).toHaveBeenCalledWith('run-id', 'run-12345')
      expect(core.setOutput).toHaveBeenCalledWith('run-status', 'completed')
      expect(core.setOutput).toHaveBeenCalledWith('run-complete', 'true')
      expect(core.setOutput).toHaveBeenCalledWith(
        'dashboard-url',
        'https://dashboard.example.test/runs/run-12345'
      )
    })

    it('should save run state for cancellation cleanup after submit succeeds', async () => {
      submitRun.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          message: 'Submitted',
          run_id: 'run-abc',
          organization_id: 'org-123'
        })
      )
      process.env.INPUT_API_URL = 'https://api.example.test'

      await run()

      expect(core.saveState).toHaveBeenCalledWith('runId', 'run-abc')
      expect(core.saveState).toHaveBeenCalledWith('organizationId', 'org-123')
      expect(core.saveState).toHaveBeenCalledWith(
        'apiUrl',
        'https://api.example.test'
      )
      expect(core.saveState).not.toHaveBeenCalledWith(
        'cancelAuthToken',
        expect.any(String)
      )
    })

    it('should prefer configured token for cancellation cleanup auth', async () => {
      submitRun.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          message: 'Submitted',
          run_id: 'run-token',
          organization_id: 'org-token'
        })
      )
      process.env.INPUT_API_URL = 'https://api.example.test'
      process.env.INPUT_TOKEN = 'configured-token'

      await run()

      expect(core.setSecret).toHaveBeenCalledWith('configured-token')
      expect(core.saveState).toHaveBeenCalledWith(
        'cancelAuthToken',
        'configured-token'
      )
    })

    it('should process file and call submitRun with correct data', async () => {
      await run()

      expect(submitRun).toHaveBeenCalledWith([
        { path: 'some_file.json', buffer: expect.any(Buffer) }
      ])
    })

    it('should fall back to fetching PR titles when backend title maps are absent', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'token') {
          return 'ghs_test'
        }
        return 'some_file.json'
      })
      const prUrl = 'https://github.com/example-org/example-repo/pull/123'
      pollStatusUntilComplete.mockResolvedValue({
        status: 'completed',
        summary: {
          total_vulnerabilities: 1,
          true_positives: 1,
          false_positives: 0,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 1,
          remediation_failed: 0,
          pr_urls: [prUrl],
          pr_count: 1,
          issue_urls: [],
          issue_count: 0
        }
      })
      fetchPrTitles.mockResolvedValue(
        new Map([[prUrl, 'Fix SQL injection in admin flow']])
      )

      await run()

      expect(fetchPrTitles).toHaveBeenCalledWith([prUrl], 'ghs_test')
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Fix SQL injection in admin flow')
      )
    })

    it('should derive dashboard URL when polling result omits dashboard_url', async () => {
      process.env.INPUT_API_URL = 'https://gh.cloud.appsecai.io'
      pollStatusUntilComplete.mockResolvedValue({
        status: 'completed',
        summary: {
          total_vulnerabilities: 0,
          true_positives: 0,
          false_positives: 0,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 0,
          remediation_failed: 0,
          pr_urls: [],
          pr_count: 0,
          issue_urls: [],
          issue_count: 0
        }
      })

      await run()

      expect(core.summary.addLink).toHaveBeenCalledWith(
        'View detailed results on the dashboard',
        'https://portal.cloud.appsecai.io/'
      )
    })

    it('should call pollStatusUntilComplete when run_id is provided', async () => {
      await run()

      expect(pollStatusUntilComplete).toHaveBeenCalledWith(
        expect.any(Function),
        720,
        30000
      )
    })
  })

  describe('file reading failures', () => {
    it('should handle general file read error and call core.error with appropriate message', async () => {
      const error = new Error('File not found')
      readFile.mockClear().mockImplementationOnce(() => Promise.reject(error))

      await run()

      expect(core.error).toHaveBeenCalledWith('File not found')
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle ENOENT error and call core.error with file not found message', async () => {
      const error = new Error('File not found')
      // @ts-ignore
      error.code = 'ENOENT'
      readFile.mockClear().mockImplementationOnce(() => Promise.reject(error))

      await run()

      expect(core.error).toHaveBeenCalledWith(
        'File not found. Please check if every file path is correct and exists. Aborting process.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle ENODATA error and call core.error with file empty message', async () => {
      const error = new Error('File is empty')
      // @ts-ignore
      error.code = 'ENODATA'
      readFile.mockClear().mockImplementationOnce(() => Promise.reject(error))

      await run()

      expect(core.error).toHaveBeenCalledWith(
        'File is empty or could not be read. Please check if every file contains data. Aborting process.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })
  })

  describe('service failures', () => {
    it('should handle string error from submitRun and call core.error', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject('Reject!')
      })

      await run()

      expect(core.error).toHaveBeenNthCalledWith(1, 'Reject!')
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle Error instance from submitRun and call core.error with error message', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Error instance!'))
      })

      await run()

      expect(core.error).toHaveBeenCalledTimes(1)

      expect(core.error).toHaveBeenCalledWith('Error instance!')
    })

    it('should handle unknown error from submitRun and call core.error with "Unknown Error"', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject(2)
      })

      await run()

      expect(core.error).toHaveBeenNthCalledWith(
        1,
        'Failed to submit analysis results for processing. Please try again later.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle submitRun without run_id and not call pollStatusUntilComplete', async () => {
      submitRun.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          message: 'Success but no run_id',
          run_id: null
        })
      )

      await run()

      expect(pollStatusUntilComplete).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith(
        'message',
        'Processing completed successfully.'
      )
    })
  })

  describe('status polling failures', () => {
    it('should fail when Product reports the run failed', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'failed',
          error: 'Triage incomplete after 15 attempts',
          processTracking: null,
          summary: null
        })
      )

      await run()

      expect(core.error).toHaveBeenCalledWith(
        'Product run failed: Triage incomplete after 15 attempts'
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        'Product run failed: Triage incomplete after 15 attempts'
      )
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'message',
        'Processing completed successfully.'
      )
    })

    it('should report PAUSED without failing when Product pauses the run', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'paused',
          reasonCode: 'RUN_PAUSED',
          diagnostic: 'run_status=paused: sustained provider throttling',
          pauseReason: 'sustained provider throttling',
          processTracking: null,
          summary: null
        })
      )

      await run()

      // A paused run is not a failure: no failure exit code.
      expect(core.setFailed).not.toHaveBeenCalled()
      // A clear paused message is printed and set as the action output.
      const pausedMessage = (core.setOutput as jest.Mock).mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1] as string
      expect(pausedMessage).toMatch(/Run paused/)
      expect(pausedMessage).toMatch(/sustained provider throttling/)
      expect(pausedMessage).toMatch(/resume automatically/)
      expect(pausedMessage).toMatch(/dashboard/i)
      expect(core.notice).toHaveBeenCalledWith(
        expect.stringContaining('Run paused')
      )
      // Must not report success-as-completed for a paused run.
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'message',
        'Processing completed successfully.'
      )
    })

    it('should report PAUSED when the run is paused at the polling limit', async () => {
      pollStatusUntilComplete
        .mockClear()
        .mockImplementationOnce(() => Promise.resolve(null))
      getStatus.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'paused',
          reasonCode: 'RUN_PAUSED',
          diagnostic: 'run_status=paused: capacity exhausted',
          pauseReason: 'capacity exhausted',
          processTracking: null,
          summary: null
        })
      )

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(core.notice).toHaveBeenCalledWith(
        expect.stringContaining('Run paused')
      )
    })

    it('should fail when polling becomes indeterminate and finalize has no summary', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Polling failed'))
      })
      await run()

      expect(core.warning).toHaveBeenCalledWith(
        '[Analysis Processing Status] Failed to poll status for run_id: run-12345. The analysis may still be running on the server.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        'Run monitoring became indeterminate and final summary data was unavailable. The server may have been unreachable or degraded while the run was still in progress.'
      )
      expect(core.setOutput).toHaveBeenCalledWith('run-id', 'run-12345')
      expect(core.setOutput).toHaveBeenCalledWith('run-status', 'unknown')
      expect(core.setOutput).toHaveBeenCalledWith('run-complete', 'false')
    })

    it('should fail closed and skip finalize when polling limit leaves the run active by default', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.resolve(null)
      })
      getStatus.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'in_progress',
          dashboard_url: 'https://dashboard.example.test/runs/run-12345',
          processTracking: null,
          summary: null
        })
      )
      finalizeRun.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          total_vulnerabilities: 0,
          true_positives: 0,
          false_positives: 0,
          cwe_breakdown: {},
          severity_breakdown: {},
          pr_count: 0,
          pr_urls: [],
          issue_urls: [],
          issue_count: 0,
          remediation_success: 0,
          remediation_failed: 0
        })
      )

      await run()

      expect(finalizeRun).not.toHaveBeenCalled()
      expect(core.warning).toHaveBeenCalledWith(
        '[Analysis Processing Status] Polling limit reached and final status check returned "in_progress". Skipping summary finalization because the server run is not known to be terminal. Dashboard: https://dashboard.example.test/runs/run-12345'
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining(
          'did not reach a terminal status before the GitHub Action monitoring window expired'
        )
      )
      expect(core.notice).not.toHaveBeenCalledWith(
        expect.stringContaining('is still processing')
      )
    })

    it('should succeed with pending outputs when long-run handoff is explicitly allowed', async () => {
      process.env.ALLOW_LONG_RUN_HANDOFF = 'true'
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.resolve(null)
      })
      getStatus.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'in_progress',
          dashboard_url: 'https://dashboard.example.test/runs/run-12345',
          processTracking: null,
          summary: null
        })
      )

      await run()

      expect(finalizeRun).not.toHaveBeenCalled()
      expect(core.setFailed).not.toHaveBeenCalled()
      expect(core.notice).toHaveBeenCalledWith(
        expect.stringContaining(
          'is still processing after the GitHub Action monitoring window'
        )
      )
      expect(core.setOutput).toHaveBeenCalledWith('run-id', 'run-12345')
      expect(core.setOutput).toHaveBeenCalledWith('run-status', 'in_progress')
      expect(core.setOutput).toHaveBeenCalledWith('run-complete', 'false')
      expect(core.setOutput).toHaveBeenCalledWith(
        'dashboard-url',
        'https://dashboard.example.test/runs/run-12345'
      )
    })

    it('should fail closed for progress status after the polling limit', async () => {
      pollStatusUntilComplete.mockResolvedValue(null)
      getStatus.mockResolvedValue({
        status: 'progress',
        processTracking: null,
        summary: null
      })

      await run()

      expect(finalizeRun).not.toHaveBeenCalled()
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('(last status: progress)')
      )
    })

    it('should fail closed for unknown status after the polling limit', async () => {
      pollStatusUntilComplete.mockResolvedValue(null)
      getStatus.mockResolvedValue({
        status: 'mystery_status',
        processTracking: null,
        summary: null
      })

      await run()

      expect(finalizeRun).not.toHaveBeenCalled()
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('(last status: mystery_status)')
      )
    })

    it('should fail as indeterminate when final status is network_error with no summary', async () => {
      pollStatusUntilComplete.mockResolvedValue(null)
      getStatus.mockResolvedValue({
        status: 'network_error',
        processTracking: null,
        summary: null
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        'Run monitoring became indeterminate and final summary data was unavailable. The server may have been unreachable or degraded while the run was still in progress.'
      )
    })

    it('should finalize when polling limit races with a completed final status check', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.resolve(null)
      })
      getStatus.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'completed',
          processTracking: null,
          summary: null
        })
      )

      await run()

      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: undefined
      })
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe('finalizeRun behavior', () => {
    it('should call finalizeRun with run_id and options in finally block on success', async () => {
      await run()

      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: undefined
      })
      expect(core.info).toHaveBeenCalledWith(
        'Finalizing run and fetching summary...'
      )
    })

    it('should skip finalizeRun when polling fails and the final status check fails', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Polling failed'))
      })

      await run()

      expect(finalizeRun).not.toHaveBeenCalled()
    })

    it('should not call finalizeRun when no run_id exists', async () => {
      submitRun.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          message: 'Success but no run_id',
          run_id: null
        })
      )

      await run()

      expect(finalizeRun).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith('run-id', '')
      expect(core.setOutput).toHaveBeenCalledWith('run-status', 'not_created')
      expect(core.setOutput).toHaveBeenCalledWith('run-complete', 'false')
      expect(core.setOutput).toHaveBeenCalledWith('dashboard-url', '')
    })

    it('should use summary from finalizeRun when polling returns no summary', async () => {
      const finalizeSummary = {
        total_vulnerabilities: 10,
        true_positives: 8,
        false_positives: 2,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 5,
        remediation_failed: 3,
        pr_urls: [],
        pr_count: 0,
        issue_urls: []
      }
      pollStatusUntilComplete
        .mockClear()
        .mockImplementationOnce(() =>
          Promise.resolve({ status: 'completed', processTracking: null })
        )
      finalizeRun
        .mockClear()
        .mockImplementationOnce(() => Promise.resolve(finalizeSummary))

      await run()

      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: undefined
      })
    })

    it('should not override existing summary from polling with finalizeRun summary', async () => {
      const pollingSummary = {
        total_vulnerabilities: 20,
        true_positives: 15,
        false_positives: 5,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 10,
        remediation_failed: 5,
        pr_urls: [],
        pr_count: 0,
        issue_urls: []
      }
      const finalizeSummary = {
        total_vulnerabilities: 10,
        true_positives: 8,
        false_positives: 2,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 5,
        remediation_failed: 3,
        pr_urls: [],
        pr_count: 0,
        issue_urls: []
      }
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'completed',
          processTracking: null,
          summary: pollingSummary
        })
      )
      finalizeRun
        .mockClear()
        .mockImplementationOnce(() => Promise.resolve(finalizeSummary))

      await run()

      // finalizeRun should still be called
      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: 0,
        organizationId: undefined
      })
    })

    it('should continue execution when finalizeRun returns null', async () => {
      finalizeRun
        .mockClear()
        .mockImplementationOnce(() => Promise.resolve(null))

      await run()

      // Should complete successfully even when finalizeRun returns null
      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: undefined
      })
      expect(core.setOutput).toHaveBeenCalledWith(
        'message',
        'Processing completed successfully.'
      )
    })

    it('should pass expectedPrCount from push_status.success_count when no summary count is available', async () => {
      const processTracking = {
        push_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 8,
          processed_items: 8,
          success_count: 8,
          error_count: 0,
          false_positive_count: 0,
          self_validation_warning_count: 0,
          self_validation_failure_count: 0,
          additional_context_required_count: 0
        }
      }
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'completed',
          processTracking,
          summary: null
        })
      )

      await run()

      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: 8
      })
    })

    it('should handle missing push_status gracefully', async () => {
      const processTracking = {
        triage_status: {
          status: 'completed',
          progress_percentage: 100,
          total_items: 10,
          processed_items: 10,
          success_count: 8,
          error_count: 0,
          false_positive_count: 2,
          self_validation_warning_count: 0,
          self_validation_failure_count: 0,
          additional_context_required_count: 0
        }
        // No push_status
      }
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'completed',
          processTracking,
          summary: null
        })
      )

      await run()

      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: undefined
      })
    })
  })

  describe('buildPausedMessage', () => {
    it('includes the provided reason', () => {
      const message = buildPausedMessage('sustained provider throttling')

      expect(message).toContain('Run paused: sustained provider throttling')
      expect(message).toContain('work preserved')
      expect(message).toContain('resume automatically')
      expect(message).toContain('AppSecAI dashboard')
    })

    it('falls back to a default reason when none is provided', () => {
      for (const empty of [undefined, null, '', '   ']) {
        const message = buildPausedMessage(empty)
        expect(message).toContain('Run paused: sustained provider throttling')
        expect(message).toContain('resume automatically')
      }
    })
  })
})
