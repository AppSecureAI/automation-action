/**
 * Unit tests for src/service.ts
 */
import github from '../__fixtures__/github.js'
import store from '../src/store'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import axios from '../__fixtures__/axios'
import {
  logSteps,
  logProcessTracking,
  logSummary
} from '../__fixtures__/utils.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', github)

jest.unstable_mockModule('axios', () => ({ default: axios }))

const mockGetApiUrl = jest.fn()
const mockGetMode = jest.fn()
const mockGetUseTriageCc = jest.fn()
const mockGetTriageMethod = jest.fn()
const mockGetUseRemediateCc = jest.fn()
const mockGetRemediateMethod = jest.fn()
const mockGetUseValidateCc = jest.fn()
const mockGetValidateMethod = jest.fn()
const mockGetUseRemediateLoopCc = jest.fn()
const mockGetAutoCreatePrs = jest.fn()

jest.mock('../src/input', () => ({
  getApiUrl: mockGetApiUrl,
  getMode: mockGetMode,
  getUseTriageCc: mockGetUseTriageCc,
  getTriageMethod: mockGetTriageMethod,
  getUseRemediateCc: mockGetUseRemediateCc,
  getRemediateMethod: mockGetRemediateMethod,
  getUseValidateCc: mockGetUseValidateCc,
  getValidateMethod: mockGetValidateMethod,
  getUseRemediateLoopCc: mockGetUseRemediateLoopCc,
  getAutoCreatePrs: mockGetAutoCreatePrs
}))
jest.mock('../src/store', () => ({
  __esModule: true,
  default: { finalLogPrinted: {} }
}))

const { getIdToken } = await import('../src/github.js')

jest.mock('../src/github', () => ({
  __esModule: true,
  default: { getIdToken }
}))

jest.unstable_mockModule('../src/utils', () => ({
  logSteps,
  logProcessTracking,
  logSummary
}))

const serviceModule = await import('../src/service')
const { submitRun, getStatus, pollStatusUntilComplete, finalizeRun, delay } =
  serviceModule

// Note: We keep the serviceModule import to access named exports
// The delay function is used in tests that use fake timers

describe('service.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation(() => 'https://some-url')
    mockGetApiUrl.mockReturnValue('https://some-url')
    mockGetMode.mockReturnValue('individual')
    mockGetUseTriageCc.mockReturnValue('false')
    mockGetTriageMethod.mockReturnValue('baseline')
    mockGetUseRemediateCc.mockReturnValue('false')
    mockGetRemediateMethod.mockReturnValue('baseline')
    mockGetUseValidateCc.mockReturnValue('false')
    mockGetValidateMethod.mockReturnValue('baseline')
    mockGetUseRemediateLoopCc.mockReturnValue('false')
    mockGetAutoCreatePrs.mockReturnValue('true')
    store.finalLogPrinted = {}
    logSteps.mockClear()
    logProcessTracking.mockClear()
    logSummary.mockClear()
  })

  afterEach(() => {
    store.finalLogPrinted = {}
  })

  describe('submitRun', () => {
    it('returns processed output on success', async () => {
      axios.post.mockResolvedValue({
        data: {
          message: 'File processed successfully',
          run_id: 'run-12345',
          description: 'Processing completed', // Add if required
          steps: [] // Add if required
        }
      })

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      const result = await submitRun(inputBuffer, 'file')

      expect(result).toEqual({
        message: 'File processed successfully',
        run_id: 'run-12345'
      })
    })

    it('handles API response schema validation failure', async () => {
      axios.post.mockResolvedValue({ data: { invalid: 'data' } })
      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow()
    })

    it('handles API error with detail description', async () => {
      axios.post.mockRejectedValue({
        response: {
          data: { detail: { description: 'Some error description' } }
        }
      })
      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow()
    })

    it('handles API error with steps data', async () => {
      axios.post.mockRejectedValue({
        response: { data: { detail: { steps: [] } } }
      })
      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow()
    })

    it('handles API error without response data', async () => {
      axios.post.mockRejectedValue(new Error('Network error'))
      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow()
    })

    it('logs steps when API returns steps in success response', async () => {
      axios.post.mockResolvedValue({
        data: {
          message: 'File processed successfully',
          run_id: 'run-12345',
          description: 'Processing completed',
          steps: [
            { name: 'step1', status: 'completed', detail: 'Step 1 done' },
            { name: 'step2', status: 'in_progress', detail: 'Step 2 running' }
          ]
        }
      })

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      const result = await submitRun(inputBuffer, 'file')

      expect(result).toEqual({
        message: 'File processed successfully',
        run_id: 'run-12345'
      })

      expect(logSteps).toHaveBeenCalledWith(
        [
          { name: 'step1', status: 'completed', detail: 'Step 1 done' },
          { name: 'step2', status: 'in_progress', detail: 'Step 2 running' }
        ],
        'Submit Analysis for Processing'
      )
    })

    it('handles API error with invalid steps data', async () => {
      axios.post.mockRejectedValue({
        response: {
          data: {
            detail: {
              description: 'Error with steps',
              steps: 'invalid-steps-data' // Invalid format
            }
          }
        }
      })

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)
      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow()
    })
    // Test for submitRun timeout handling
    it('handles timeout in submitRun', async () => {
      const timeoutError = new Error('timeout of 480000ms exceeded')
      Object.assign(timeoutError, {
        code: 'ECONNABORTED',
        isAxiosError: true
      })

      axios.post.mockRejectedValue(timeoutError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        '[Submit Analysis for Processing] Call failed: Request timed out. Please try again later.'
      )
    })

    // Test for API error with response but no data
    it('handles API error with response but no data in submitRun', async () => {
      axios.post.mockRejectedValue({
        response: { status: 500 }, // No data property
        isAxiosError: true,
        message: 'Internal Server Error'
      })

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        '[Submit Analysis for Processing] Call failed: Internal Server Error'
      )
    })
  })

  describe('getStatus', () => {
    it('returns status data on success with results', async () => {
      axios.get.mockResolvedValue({
        data: {
          message: 'Scan in progress',
          description: 'Processing',
          results: {
            find: { count: 5, extras: { cwe_list: ['CWE-79', 'CWE-89'] } },
            triage: {
              count: 4,
              extras: { true_positives: 3, false_positives: 1 }
            },
            remediate: { count: 0, extras: {} },
            validate: { count: 0, extras: {} },
            push: { count: 0, extras: {} }
          }
        }
      })
      const result = await getStatus('test-id')

      expect(result).toEqual({ status: 'progress' })
      expect(core.debug).toHaveBeenCalledWith(
        'Calling status API: GET /api-product/submit/status/test-id'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: CWE found: CWE-79, CWE-89'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: True positives found: 3'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: False positives found: 1'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: find ..... processed 5 vulnerabilities'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: triage ..... processed 4 vulnerabilities'
      )
    })

    it('returns status data on success without results', async () => {
      axios.get.mockResolvedValue({
        data: {
          message: 'Scan in progress',
          description: 'Processing',
          results: {
            find: { count: 0, extras: {} },
            triage: { count: 0, extras: {} },
            remediate: { count: 0, extras: {} },
            validate: { count: 0, extras: {} },
            push: { count: 0, extras: {} }
          }
        }
      })
      const result = await getStatus('test-id')

      expect(result).toEqual({ status: 'progress' })
      expect(core.debug).toHaveBeenCalledWith(
        'Calling status API: GET /api-product/submit/status/test-id'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: find ..... processed 0 vulnerabilities'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[Analysis Processing Status]: find solver has processed all vulnerabilities!'
      )
    })

    it('handles API response schema validation failure', async () => {
      axios.get.mockResolvedValue({
        data: {
          message: 'Scan in progress',
          description: 'Processing',
          results: {
            // find is missing
            triage: {
              count: 4,
              extras: { true_positives: 3, false_positives: 1 }
            },
            remediate: { count: 0, extras: {} },
            validate: { count: 0, extras: {} },
            push: { count: 0, extras: {} }
          }
        }
      })
      await expect(getStatus('test-id')).rejects.toThrow(
        /unexpected response format/
      )
      expect(core.error).toHaveBeenCalledWith(
        '[Analysis Processing Status] failed: Received an unexpected response format from the server. Please contact support if this issue persists.'
      )
    })

    it('returns failed status on error', async () => {
      axios.get.mockRejectedValue(new Error('API error'))
      const result = await getStatus('test-id')

      expect(result).toEqual({
        status: 'failed',
        error: 'Status check failed'
      })
      expect(core.warning).toHaveBeenCalledWith(
        '[Analysis Processing Status]: An unexpected error occurred. Please try again later.'
      )
    })
  })

  it('handles timeout errors correctly', async () => {
    // 1. Create a mock error with the 'ECONNABORTED' code
    const timeoutError = new Error('timeout of 8000ms exceeded')
    Object.assign(timeoutError, { code: 'ECONNABORTED', isAxiosError: true })

    // 2. Configure the mock to return a rejected promise with the timeout error
    axios.get.mockRejectedValue(timeoutError)

    // 3. Call the function and expect the correct return value
    const result = await getStatus('test-id')

    // 4. Verify the result and logging behavior
    expect(result).toEqual({
      status: 'failed',
      error: 'Status check failed'
    })
    expect(core.warning).toHaveBeenCalledWith(
      '[Analysis Processing Status] Call failed: Request timed out. Please try again later.'
    )
  })

  it('handles generic API errors correctly', async () => {
    // 1. Create a mock for a generic Axios error
    const genericError = new Error('API error message')
    Object.assign(genericError, { isAxiosError: true })

    // 2. Configure the mock to return a rejected promise
    axios.get.mockRejectedValue(genericError)

    // 3. Call the function and expect the correct return value
    const result = await getStatus('test-id')

    // 4. Verify the result and logging behavior
    expect(result).toEqual({
      status: 'failed',
      error: 'Status check failed'
    })
    expect(core.warning).toHaveBeenCalledWith(
      '[Analysis Processing Status] Call failed: API error message'
    )
  })

  it('handles status response with null results object', async () => {
    axios.get.mockResolvedValue({
      data: {
        message: 'Scan in progress',
        description: 'Processing',
        results: null // Explicitly null, which is allowed by schema
      }
    })

    const result = await getStatus('test-id')

    expect(result).toEqual({ status: 'progress' })
    expect(core.debug).toHaveBeenCalledWith(
      '[Analysis Processing Status]: No results found (.......)'
    )
    expect(core.info).toHaveBeenCalledWith('.......')
  })

  it('handles status response with null solver results', async () => {
    axios.get.mockResolvedValue({
      data: {
        message: 'Scan in progress',
        description: 'Processing',
        results: {
          find: null, // Null solver results are allowed by schema
          triage: { count: 4, extras: { true_positives: 2 } },
          remediate: { count: 0, extras: {} },
          validate: { count: 0, extras: {} },
          push: { count: 0, extras: {} }
        }
      }
    })

    const result = await getStatus('test-id')

    expect(result).toEqual({ status: 'progress' })
    // Should handle gracefully when solver result is null
  })

  // Test schema validation failures instead of trying to pass invalid data
  it('handles API response schema validation failure for invalid find.count', async () => {
    axios.get.mockResolvedValue({
      data: {
        message: 'Scan in progress',
        description: 'Processing',
        results: {
          find: { count: 'invalid', extras: {} }, // This will fail schema validation
          triage: { count: 4, extras: {} },
          remediate: { count: 0, extras: {} },
          validate: { count: 0, extras: {} },
          push: { count: 0, extras: {} }
        }
      }
    })

    await expect(getStatus('test-id')).rejects.toThrow(
      /unexpected response format/
    )
    expect(core.error).toHaveBeenCalledWith(
      '[Analysis Processing Status] failed: Received an unexpected response format from the server. Please contact support if this issue persists.'
    )
  })

  it('handles API error with status code', async () => {
    const errorWithStatus = new Error('API error')
    Object.assign(errorWithStatus, {
      isAxiosError: true,
      response: { status: 404 }
    })

    axios.get.mockRejectedValue(errorWithStatus)
    const result = await getStatus('test-id')

    expect(result).toEqual({
      status: 'failed',
      error: 'Status check failed'
    })
    expect(core.warning).toHaveBeenCalledWith(
      '[Analysis Processing Status] Call failed with status code: 404. Please try again later.'
    )
  })

  it('handles non-axios errors', async () => {
    const nonAxiosError = new Error('Non-axios error')

    axios.get.mockRejectedValue(nonAxiosError)
    const result = await getStatus('test-id')

    expect(result).toEqual({
      status: 'failed',
      error: 'Status check failed'
    })
    expect(core.warning).toHaveBeenCalledWith(
      '[Analysis Processing Status]: An unexpected error occurred. Please try again later.'
    )
    expect(core.debug).toHaveBeenCalledWith(
      'Calling status API: GET /api-product/submit/status/test-id'
    )
  })

  describe('pollStatusUntilComplete', () => {
    it('returns completed status when processing finishes', async () => {
      const mockGetStatus = () => Promise.resolve({ status: 'completed' })
      const result = await pollStatusUntilComplete(mockGetStatus, 2, 100)

      expect(result).toEqual({
        status: 'completed'
      })
    })

    it('returns null when processing fails', async () => {
      pollStatusUntilComplete(async () => ({ status: 's' }), 1, 10)
      const mockGetStatus = () => Promise.resolve({ status: 'failed' })
      const result = await pollStatusUntilComplete(mockGetStatus, 2, 100)

      expect(result).toBeNull()
    })

    it('returns null when processing times out', async () => {
      pollStatusUntilComplete

      const mockGetStatus = () => Promise.resolve({ status: 'progress' })
      const result = await pollStatusUntilComplete(mockGetStatus, 2, 100)

      expect(result).toBeNull()
    })

    it('handles unexpected errors during status checks', async () => {
      pollStatusUntilComplete

      const mockGetStatus = () => Promise.resolve({ status: 'completed' })
      const result = await pollStatusUntilComplete(mockGetStatus, 3, 100)

      expect(result).toEqual({ status: 'completed' })
    })
  })
  it('handles errors during status checks and continues polling', async () => {
    let callCount = 0
    const mockGetStatus = () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Temporary error')
      }
      return Promise.resolve({ status: 'completed' })
    }

    const result = await pollStatusUntilComplete(mockGetStatus, 3, 100)

    expect(result).toEqual({ status: 'completed' })
    expect(core.debug).toHaveBeenCalledWith(
      'Status check attempt failed. Retrying...'
    )
    expect(core.debug).toHaveBeenCalledWith(
      'Original status error: Temporary error'
    )
  })

  it('handles errors with no message property', async () => {
    let callCount = 0
    const mockGetStatus = () => {
      callCount++
      if (callCount === 1) {
        throw { someProperty: 'error without message' } // Error object without message
      }
      return Promise.resolve({ status: 'completed' })
    }

    const result = await pollStatusUntilComplete(mockGetStatus, 3, 100)

    expect(result).toEqual({ status: 'completed' })
    expect(core.debug).toHaveBeenCalledWith(
      'Original status error: [object Object]'
    )
  })

  describe('finalizeRun', () => {
    it('returns summary on successful finalize call', async () => {
      const mockSummary = {
        total_vulnerabilities: 10,
        true_positives: 8,
        false_positives: 2,
        cwe_breakdown: { 'CWE-79': 5 },
        severity_breakdown: { high: 3, medium: 7 },
        remediation_success: 5,
        remediation_failed: 3,
        pr_urls: ['https://github.com/org/repo/pull/1'],
        pr_count: 1
      }
      axios.post.mockResolvedValue({ data: mockSummary })

      const result = await finalizeRun('test-run-id')

      expect(result).toEqual(mockSummary)
      expect(core.debug).toHaveBeenCalledWith(
        'Calling finalize API: POST https://some-url/api-product/runs/test-run-id/compute-summary'
      )
      expect(core.info).toHaveBeenCalledWith(
        '[FINALIZE]: Summary computed successfully'
      )
      expect(logSummary).toHaveBeenCalledWith(mockSummary)
    })

    it('returns null and logs warning on invalid response format', async () => {
      // Response with wrong types - total_vulnerabilities should be a number, not a string
      axios.post.mockResolvedValue({
        data: { total_vulnerabilities: 'not-a-number' }
      })

      const result = await finalizeRun('test-run-id')

      expect(result).toBeNull()
      expect(core.warning).toHaveBeenCalledWith(
        '[FINALIZE]: Received unexpected response format from finalize API'
      )
    })

    it('returns null and logs warning on timeout', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded')
      Object.assign(timeoutError, { code: 'ECONNABORTED', isAxiosError: true })
      axios.post.mockRejectedValue(timeoutError)

      const result = await finalizeRun('test-run-id')

      expect(result).toBeNull()
      expect(core.warning).toHaveBeenCalledWith('[FINALIZE]: Request timed out')
    })

    it('returns null and logs warning on 404 error', async () => {
      const notFoundError = new Error('Not Found')
      Object.assign(notFoundError, {
        response: { status: 404 },
        isAxiosError: true
      })
      axios.post.mockRejectedValue(notFoundError)

      const result = await finalizeRun('test-run-id')

      expect(result).toBeNull()
      expect(core.warning).toHaveBeenCalledWith(
        '[FINALIZE]: Run not found or finalize endpoint not available'
      )
    })

    it('returns null and logs warning on other API errors', async () => {
      const apiError = new Error('Internal Server Error')
      Object.assign(apiError, { isAxiosError: true })
      axios.post.mockRejectedValue(apiError)

      const result = await finalizeRun('test-run-id')

      expect(result).toBeNull()
      expect(core.warning).toHaveBeenCalledWith(
        '[FINALIZE]: Could not compute summary: Internal Server Error'
      )
    })

    it('returns null and logs warning on non-axios errors', async () => {
      axios.post.mockRejectedValue(new Error('Network error'))

      const result = await finalizeRun('test-run-id')

      expect(result).toBeNull()
      expect(core.warning).toHaveBeenCalledWith(
        '[FINALIZE]: Could not compute summary'
      )
      expect(core.debug).toHaveBeenCalledWith(
        'Original error: Error: Network error'
      )
    })

    it('applies default values from schema for missing fields', async () => {
      axios.post.mockResolvedValue({
        data: {
          total_vulnerabilities: 5
          // All other fields should use defaults
        }
      })

      const result = await finalizeRun('test-run-id')

      expect(result).toEqual({
        total_vulnerabilities: 5,
        true_positives: 0,
        false_positives: 0,
        cwe_breakdown: {},
        severity_breakdown: {},
        remediation_success: 0,
        remediation_failed: 0,
        pr_urls: [],
        pr_count: 0
      })
    })

    describe('retry logic with expectedPrCount', () => {
      // Use very short retry delays for testing to avoid actual waits
      const testRetryDelay = 10 // 10ms instead of 2000ms

      it('retries when pr_count is less than expectedPrCount', async () => {
        const incompleteSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: ['https://github.com/org/repo/pull/1'],
          pr_count: 7
        }
        const completeSummary = {
          ...incompleteSummary,
          pr_urls: [
            ...incompleteSummary.pr_urls,
            'https://github.com/org/repo/pull/2'
          ],
          pr_count: 8
        }

        axios.post
          .mockResolvedValueOnce({ data: incompleteSummary })
          .mockResolvedValueOnce({ data: completeSummary })

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          retryDelay: testRetryDelay
        })

        expect(result).toEqual(completeSummary)
        expect(axios.post).toHaveBeenCalledTimes(2)
        expect(core.info).toHaveBeenCalledWith(
          expect.stringContaining(
            'Summary shows 7 PRs, expected 8. Retrying in'
          )
        )
      })

      it('returns best summary after max retries when count never matches', async () => {
        const incompleteSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: ['https://github.com/org/repo/pull/1'],
          pr_count: 7
        }

        axios.post.mockResolvedValue({ data: incompleteSummary })

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          maxRetries: 3,
          retryDelay: testRetryDelay
        })

        expect(result).toEqual(incompleteSummary)
        expect(axios.post).toHaveBeenCalledTimes(3)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            'Could not get complete summary after 3 attempts'
          )
        )
      })

      it('succeeds immediately when pr_count matches expectedPrCount', async () => {
        const completeSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: ['https://github.com/org/repo/pull/1'],
          pr_count: 8
        }

        axios.post.mockResolvedValue({ data: completeSummary })

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          retryDelay: testRetryDelay
        })

        expect(result).toEqual(completeSummary)
        expect(axios.post).toHaveBeenCalledTimes(1)
        expect(core.info).toHaveBeenCalledWith(
          '[FINALIZE]: Summary computed successfully'
        )
      })

      it('succeeds when pr_count exceeds expectedPrCount', async () => {
        const completeSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: [
            'https://github.com/org/repo/pull/1',
            'https://github.com/org/repo/pull/2'
          ],
          pr_count: 9 // More PRs than expected
        }

        axios.post.mockResolvedValue({ data: completeSummary })

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          retryDelay: testRetryDelay
        })

        expect(result).toEqual(completeSummary)
        expect(axios.post).toHaveBeenCalledTimes(1)
      })

      it('uses custom retry options', async () => {
        const summary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: [],
          pr_count: 0
        }

        axios.post.mockResolvedValue({ data: summary })

        await finalizeRun('test-run-id', {
          expectedPrCount: 5,
          maxRetries: 5,
          retryDelay: testRetryDelay
        })

        expect(axios.post).toHaveBeenCalledTimes(5)
      })

      it('retries on transient API errors', async () => {
        const apiError = new Error('Internal Server Error')
        Object.assign(apiError, { isAxiosError: true })

        const completeSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: [],
          pr_count: 8
        }

        axios.post
          .mockRejectedValueOnce(apiError)
          .mockResolvedValueOnce({ data: completeSummary })

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          retryDelay: testRetryDelay
        })

        expect(result).toEqual(completeSummary)
        expect(axios.post).toHaveBeenCalledTimes(2)
        expect(core.warning).toHaveBeenCalledWith(
          '[FINALIZE]: Could not compute summary: Internal Server Error'
        )
      })

      it('does not retry on 404 errors', async () => {
        const notFoundError = new Error('Not Found')
        Object.assign(notFoundError, {
          response: { status: 404 },
          isAxiosError: true
        })

        axios.post.mockRejectedValue(notFoundError)

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          maxRetries: 3,
          retryDelay: testRetryDelay
        })

        expect(result).toBeNull()
        expect(axios.post).toHaveBeenCalledTimes(1) // No retries
      })

      it('retries on parse errors', async () => {
        const invalidResponse = {
          data: { total_vulnerabilities: 'not-a-number' }
        }
        const validSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: [],
          pr_count: 8
        }

        axios.post
          .mockResolvedValueOnce(invalidResponse)
          .mockResolvedValueOnce({ data: validSummary })

        const result = await finalizeRun('test-run-id', {
          maxRetries: 2,
          retryDelay: testRetryDelay
        })

        expect(result).toEqual(validSummary)
        expect(axios.post).toHaveBeenCalledTimes(2)
        expect(core.warning).toHaveBeenCalledWith(
          '[FINALIZE]: Received unexpected response format from finalize API'
        )
      })

      it('returns last valid summary when all retries fail with parse errors', async () => {
        const invalidResponse = {
          data: { total_vulnerabilities: 'not-a-number' }
        }

        axios.post.mockResolvedValue(invalidResponse)

        const result = await finalizeRun('test-run-id', {
          maxRetries: 2,
          retryDelay: testRetryDelay
        })

        expect(result).toBeNull() // No valid summary was ever obtained
        expect(axios.post).toHaveBeenCalledTimes(2)
      })

      it('returns last valid summary after errors exhaust retries', async () => {
        const validSummary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: [],
          pr_count: 5
        }
        const apiError = new Error('Server Error')
        Object.assign(apiError, { isAxiosError: true })

        axios.post
          .mockResolvedValueOnce({ data: validSummary })
          .mockRejectedValueOnce(apiError)
          .mockRejectedValueOnce(apiError)

        const result = await finalizeRun('test-run-id', {
          expectedPrCount: 8,
          maxRetries: 3,
          retryDelay: testRetryDelay
        })

        // Returns the last valid summary even though count doesn't match
        expect(result).toEqual(validSummary)
        expect(axios.post).toHaveBeenCalledTimes(3)
      })

      it('skips validation when expectedPrCount is undefined', async () => {
        const summary = {
          total_vulnerabilities: 10,
          true_positives: 8,
          false_positives: 2,
          cwe_breakdown: {},
          severity_breakdown: {},
          remediation_success: 8,
          remediation_failed: 0,
          pr_urls: [],
          pr_count: 0
        }

        axios.post.mockResolvedValue({ data: summary })

        // No expectedPrCount provided - should not retry
        const result = await finalizeRun('test-run-id')

        expect(result).toEqual(summary)
        expect(axios.post).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('delay function', () => {
    it('resolves after the specified time', async () => {
      jest.useFakeTimers()

      const promise = delay(1000)

      // Fast-forward time
      jest.advanceTimersByTime(1000)

      // Ensure the promise resolves
      await expect(promise).resolves.toBeUndefined()

      jest.useRealTimers()
    })
  })
})
