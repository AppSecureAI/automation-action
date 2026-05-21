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
import {
  generateRegressionEvidence,
  parseRegressionEvidenceArtifactListInput,
  parseRegressionEvidenceTestCommandsInput,
  publishRegressionEvidenceCommentFromContext
} from '../__fixtures__/regression-evidence'

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
jest.unstable_mockModule('../src/regression-evidence', () => ({
  generateRegressionEvidence,
  parseRegressionEvidenceArtifactListInput,
  parseRegressionEvidenceTestCommandsInput,
  publishRegressionEvidenceCommentFromContext,
  RegressionEvidenceStatus: {
    VERIFIED: 'verified',
    PARTIAL: 'partial',
    AT_RISK: 'at_risk'
  }
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main')

describe('main.ts', () => {
  beforeEach(() => {
    delete process.env.PROCESSING_MODE
    delete process.env.INPUT_API_URL
    delete process.env.INPUT_TOKEN
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
    generateRegressionEvidence.mockResolvedValue({
      artifact: {
        status: 'verified'
      },
      markdown: '## Regression Evidence\\n- final status: **verified**',
      jsonPath: '/tmp/regression-evidence.json',
      markdownPath: '/tmp/regression-evidence.md'
    })
    parseRegressionEvidenceArtifactListInput.mockReturnValue([])
    parseRegressionEvidenceTestCommandsInput.mockReturnValue([])
    publishRegressionEvidenceCommentFromContext.mockResolvedValue('skipped')
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
      const prUrl = 'https://github.com/AppSecureAI/Product/pull/123'
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
        240,
        30000
      )
    })
  })

  describe('regression evidence mode', () => {
    it('should generate regression evidence and set mode outputs', async () => {
      process.env.PROCESSING_MODE = 'regression_evidence'

      await run()

      expect(generateRegressionEvidence).toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith(
        'regression-evidence-status',
        'verified'
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'regression-evidence-json-path',
        '/tmp/regression-evidence.json'
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'regression-evidence-markdown-path',
        '/tmp/regression-evidence.md'
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'message',
        'Regression evidence generated successfully.'
      )
      expect(submitRun).not.toHaveBeenCalled()
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
    })

    it('should fail and skip finalize when polling limit leaves the run active', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.resolve(null)
      })
      getStatus.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          status: 'in_progress',
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
        '[Analysis Processing Status] Polling limit reached and final status check returned "in_progress". Skipping summary finalization because the server run is not known to be terminal.'
      )
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
})
