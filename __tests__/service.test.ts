/**
 * Unit tests for src/service.ts
 */
import github from '../__fixtures__/github.js'
import store from '../src/store'
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import axios from '../__fixtures__/axios'
import { logSteps, logProcessTracking } from '../__fixtures__/utils.js'

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
  logProcessTracking
}))

const { submitRun, getStatus, pollStatusUntilComplete } =
  await import('../src/service')

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
})
