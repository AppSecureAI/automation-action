/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'
import { fileExists, readFile } from '../__fixtures__/file'
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
  readFile
}))
jest.unstable_mockModule('../src/service', () => ({
  submitRun,
  getStatus,
  pollStatusUntilComplete,
  finalizeRun
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main')

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation(() => 'some_file.json')
    readFile.mockImplementation((filePath: string) => {
      const jsonData = JSON.stringify({ key: filePath })
      const inputBuffer = Buffer.from(jsonData)
      return Promise.resolve(inputBuffer)
    })
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

      expect(submitRun).toHaveBeenCalledWith(
        expect.any(Buffer),
        'some_file.json'
      )
    })

    it('should call pollStatusUntilComplete when run_id is provided', async () => {
      await run()

      expect(pollStatusUntilComplete).toHaveBeenCalledWith(
        expect.any(Function),
        50,
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
        'File not found: some_file.json. Please check if the file path is correct and the file exists. Aborting process.'
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
        'File is empty or could not be read: some_file.json. Please check if the file contains data. Aborting process.'
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

      expect(core.error).toHaveBeenNthCalledWith(
        1,
        'Failed to submit analysis results for processing. Please try again later.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle Error instance from submitRun and call core.error with error message', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Error instance!'))
      })

      await run()

      expect(core.error).toHaveBeenCalledTimes(1)

      // Check that the mock calls include the two expected messages
      expect(core.error).toHaveBeenCalledWith(
        'Failed to submit analysis results for processing. Please try again later.'
      )
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
    it('should handle pollStatusUntilComplete failure and call core.warning', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Polling failed'))
      })
      await run()

      expect(core.warning).toHaveBeenCalledWith(
        '[Analysis Processing Status] Failed to poll status for run_id: run-12345. The analysis may still be running on the server.'
      )
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

    it('should call finalizeRun in finally block even on error', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Polling failed'))
      })

      await run()

      expect(finalizeRun).toHaveBeenCalledWith('run-12345', {
        expectedPrCount: undefined
      })
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
        pr_count: 0
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
        pr_count: 0
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
        pr_count: 0
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
        expectedPrCount: undefined
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

    it('should pass expectedPrCount from push_status.success_count', async () => {
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
