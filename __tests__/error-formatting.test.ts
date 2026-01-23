/**
 * Unit tests for error parsing and formatting functions in src/service.ts
 * Tests quota exceeded (429), payment required (402), and server error (500) handling.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import axios from '../__fixtures__/axios'

jest.unstable_mockModule('@actions/core', () => core)
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

jest.unstable_mockModule('../src/utils', () => ({
  logSteps: jest.fn(),
  logProcessTracking: jest.fn(),
  logSummary: jest.fn()
}))

const { parseApiError, formatErrorMessage, submitRun } =
  await import('../src/service')

describe('Error Formatting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
  })

  describe('parseApiError', () => {
    it('returns null for non-axios errors', () => {
      const error = new Error('Regular error')
      const result = parseApiError(error)
      expect(result).toBeNull()
    })

    it('parses axios error without response data', () => {
      const error = {
        isAxiosError: true,
        message: 'Network error',
        response: undefined
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.statusCode).toBe(0)
      expect(result?.message).toBe('Network error')
    })

    it('parses quota exceeded error (429) with full details', () => {
      const error = {
        isAxiosError: true,
        message: 'Too Many Requests',
        response: {
          status: 429,
          data: {
            error: 'Run quota exceeded',
            message: 'Organization has used 2/0 runs.',
            quota_used: 2,
            quota_limit: 0,
            period_start: '2025-12-01',
            period_end: '2025-12-31'
          }
        }
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.statusCode).toBe(429)
      expect(result?.errorCode).toBe('QUOTA_EXCEEDED')
      expect(result?.quotaDetails).toBeDefined()
      expect(result?.quotaDetails?.quota_used).toBe(2)
      expect(result?.quotaDetails?.quota_limit).toBe(0)
      expect(result?.quotaDetails?.period_start).toBe('2025-12-01')
      expect(result?.quotaDetails?.period_end).toBe('2025-12-31')
    })

    it('parses payment required error (402) with message', () => {
      const error = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            message: 'Your subscription has expired'
          }
        }
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.statusCode).toBe(402)
      expect(result?.errorCode).toBe('PAYMENT_REQUIRED')
      expect(result?.message).toBe('Your subscription has expired')
    })

    it('parses payment required error (402) with detail string', () => {
      const error = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            detail: 'Please update your payment method'
          }
        }
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.statusCode).toBe(402)
      expect(result?.message).toBe('Please update your payment method')
    })

    it('parses server error (500) with detail', () => {
      const error = {
        isAxiosError: true,
        message: 'Internal Server Error',
        response: {
          status: 500,
          data: {
            detail: 'Database connection failed'
          }
        }
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.statusCode).toBe(500)
      expect(result?.errorCode).toBe('SERVER_ERROR')
      expect(result?.message).toBe('Database connection failed')
    })

    it('parses server error (500) with structured detail', () => {
      const error = {
        isAxiosError: true,
        message: 'Internal Server Error',
        response: {
          status: 500,
          data: {
            detail: {
              description: 'Service temporarily unavailable'
            }
          }
        }
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.statusCode).toBe(500)
      expect(result?.message).toBe('Service temporarily unavailable')
    })

    it('parses structured error detail with code', () => {
      const error = {
        isAxiosError: true,
        message: 'Bad Request',
        response: {
          status: 400,
          data: {
            detail: {
              code: 'PLAN_EXPIRED',
              description: 'Your plan expired on 2025-12-01',
              organization_id: 'org-123',
              expires_at: '2025-12-01T00:00:00Z'
            }
          }
        }
      }

      const result = parseApiError(error)

      expect(result).not.toBeNull()
      expect(result?.errorCode).toBe('PLAN_EXPIRED')
      expect(result?.message).toBe('Your plan expired on 2025-12-01')
      expect(result?.structuredDetails?.organization_id).toBe('org-123')
      expect(result?.structuredDetails?.expires_at).toBe('2025-12-01T00:00:00Z')
    })
  })

  describe('formatErrorMessage', () => {
    const prefixLabel = '[Submit Analysis for Processing]'

    it('formats quota exceeded error with full details', () => {
      const error = {
        statusCode: 429,
        errorCode: 'QUOTA_EXCEEDED',
        message: 'Organization has used 2/0 runs.',
        quotaDetails: {
          quota_used: 2,
          quota_limit: 0,
          period_start: '2025-12-01',
          period_end: '2025-12-31'
        }
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('QUOTA EXCEEDED')
      expect(result).toContain(
        'Your organization has reached its run limit for this billing period.'
      )
      expect(result).toContain('2 runs used / 0 runs available')
      expect(result).toContain('2025-12-01 to 2025-12-31')
      expect(result).toContain(
        'Upgrade your plan at https://app.appsecai.net/settings/billing'
      )
      expect(result).toContain('support@appsecai.io')
    })

    it('formats quota exceeded error without details', () => {
      const error = {
        statusCode: 429,
        errorCode: 'QUOTA_EXCEEDED',
        message: 'Quota exceeded',
        quotaDetails: undefined
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('QUOTA EXCEEDED')
      expect(result).toContain(
        'Your organization has reached its run limit for this billing period.'
      )
      expect(result).toContain(
        'Upgrade your plan at https://app.appsecai.net/settings/billing'
      )
    })

    it('formats payment required error', () => {
      const error = {
        statusCode: 402,
        errorCode: 'PAYMENT_REQUIRED',
        message: 'Your subscription has expired'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('PAYMENT REQUIRED')
      expect(result).toContain('Your subscription has expired')
      expect(result).toContain(
        'Update your payment method at https://app.appsecai.net/settings/billing'
      )
      expect(result).toContain('support@appsecai.io')
    })

    it('formats payment required error with default message', () => {
      const error = {
        statusCode: 402,
        errorCode: 'PAYMENT_REQUIRED',
        message: ''
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('PAYMENT REQUIRED')
      expect(result).toContain(
        'A payment is required to continue using this service.'
      )
    })

    it('formats server error', () => {
      const error = {
        statusCode: 500,
        errorCode: 'SERVER_ERROR',
        message: 'Database connection failed'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('SERVER ERROR')
      expect(result).toContain('Database connection failed')
      expect(result).toContain('Wait a few minutes and retry your request')
      expect(result).toContain('https://status.appsecai.net')
      expect(result).toContain('support@appsecai.io')
    })

    it('formats server error with default message', () => {
      const error = {
        statusCode: 500,
        errorCode: 'SERVER_ERROR',
        message: ''
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('SERVER ERROR')
      expect(result).toContain('An internal server error occurred.')
    })

    it('formats structured error with code', () => {
      const error = {
        statusCode: 400,
        errorCode: 'PLAN_EXPIRED',
        message: 'Your plan expired on 2025-12-01',
        structuredDetails: {
          code: 'PLAN_EXPIRED',
          description: 'Your plan expired on 2025-12-01'
        }
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        '[Submit Analysis for Processing] [PLAN_EXPIRED] Your plan expired on 2025-12-01'
      )
    })

    it('formats default error message for unknown status codes', () => {
      const error = {
        statusCode: 418,
        message: 'I am a teapot'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe('[Submit Analysis for Processing] I am a teapot')
    })
  })

  describe('submitRun integration with error formatting', () => {
    it('formats quota exceeded error from API response', async () => {
      const quotaError = {
        isAxiosError: true,
        message: 'Too Many Requests',
        response: {
          status: 429,
          data: {
            error: 'Run quota exceeded',
            message: 'Organization has used 2/0 runs.',
            quota_used: 2,
            quota_limit: 0,
            period_start: '2025-12-01',
            period_end: '2025-12-31'
          }
        }
      }

      axios.post.mockRejectedValue(quotaError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'QUOTA EXCEEDED'
      )

      expect(core.error).toHaveBeenCalled()
      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('QUOTA EXCEEDED')
      expect(errorCall).toContain('2 runs used / 0 runs available')
      expect(errorCall).toContain('2025-12-01 to 2025-12-31')
      expect(errorCall).toContain('https://app.appsecai.net/settings/billing')
    })

    it('formats payment required error from API response', async () => {
      const paymentError = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            message: 'Your subscription has expired'
          }
        }
      }

      axios.post.mockRejectedValue(paymentError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'PAYMENT REQUIRED'
      )

      expect(core.error).toHaveBeenCalled()
      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('PAYMENT REQUIRED')
      expect(errorCall).toContain('Your subscription has expired')
      expect(errorCall).toContain('https://app.appsecai.net/settings/billing')
    })

    it('formats server error from API response', async () => {
      const serverError = {
        isAxiosError: true,
        message: 'Internal Server Error',
        response: {
          status: 500,
          data: {
            detail: 'Database connection failed'
          }
        }
      }

      axios.post.mockRejectedValue(serverError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'SERVER ERROR'
      )

      expect(core.error).toHaveBeenCalled()
      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('SERVER ERROR')
      expect(errorCall).toContain('Database connection failed')
      expect(errorCall).toContain('Wait a few minutes and retry your request')
      expect(errorCall).toContain('https://status.appsecai.net')
    })

    it('logs quota debug information', async () => {
      const quotaError = {
        isAxiosError: true,
        message: 'Too Many Requests',
        response: {
          status: 429,
          data: {
            error: 'Run quota exceeded',
            message: 'Organization has used 5/3 runs.',
            quota_used: 5,
            quota_limit: 3,
            period_start: '2025-12-01',
            period_end: '2025-12-31'
          }
        }
      }

      axios.post.mockRejectedValue(quotaError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow()

      expect(core.debug).toHaveBeenCalledWith('Quota used: 5')
      expect(core.debug).toHaveBeenCalledWith('Quota limit: 3')
      expect(core.debug).toHaveBeenCalledWith('Period start: 2025-12-01')
      expect(core.debug).toHaveBeenCalledWith('Period end: 2025-12-31')
    })

    it('still handles legacy string detail errors', async () => {
      const legacyError = {
        isAxiosError: true,
        message: 'Bad Request',
        response: {
          status: 400,
          data: {
            detail: 'Invalid SARIF format'
          }
        }
      }

      axios.post.mockRejectedValue(legacyError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'Invalid SARIF format'
      )
    })

    it('still handles structured error codes', async () => {
      const structuredError = {
        isAxiosError: true,
        message: 'Bad Request',
        response: {
          status: 400,
          data: {
            detail: {
              code: 'PLAN_EXPIRED',
              description: 'Your plan expired on 2025-12-01'
            }
          }
        }
      }

      axios.post.mockRejectedValue(structuredError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        '[PLAN_EXPIRED]'
      )
    })

    it('handles timeout errors correctly', async () => {
      const timeoutError = new Error('timeout of 480000ms exceeded')
      Object.assign(timeoutError, {
        code: 'ECONNABORTED',
        isAxiosError: true
      })

      axios.post.mockRejectedValue(timeoutError)

      const jsonData = JSON.stringify({ key: 'value' })
      const inputBuffer = Buffer.from(jsonData)

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'Request timed out'
      )
    })
  })
})
