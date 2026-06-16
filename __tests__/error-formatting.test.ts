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

const {
  parseApiError,
  formatErrorMessage,
  submitRun,
  isActionableServerMessage
} = await import('../src/service')

describe('Error Formatting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    core.getInput.mockImplementation((name: string) => {
      if (name === 'api-url') return 'https://some-url'
      if (name === 'comment-modification-mode') return 'basic'
      return ''
    })
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

    it('uses a default message when axios error message is empty', () => {
      const error = {
        isAxiosError: true,
        message: '',
        response: undefined
      }

      const result = parseApiError(error)

      expect(result?.message).toBe('An unexpected error occurred')
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

    it('falls back across quota error message fields', () => {
      const errorOnly = {
        isAxiosError: true,
        message: 'Too Many Requests',
        response: {
          status: 429,
          data: {
            error: 'Run quota exceeded'
          }
        }
      }
      const noMessageFields = {
        isAxiosError: true,
        message: 'Too Many Requests',
        response: {
          status: 429,
          data: {
            quota_used: 2
          }
        }
      }

      expect(parseApiError(errorOnly)?.message).toBe('Run quota exceeded')
      expect(parseApiError(noMessageFields)?.message).toBe('Too Many Requests')
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

    it('defaults payment required object details without a description', () => {
      const error = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            detail: {}
          }
        }
      }

      const result = parseApiError(error)

      expect(result?.message).toBe('Payment required')
    })

    it('parses a flat-code 402 QUOTA_EXCEEDED detail with usage numbers', () => {
      const error = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            detail: {
              code: 'QUOTA_EXCEEDED',
              description: 'Organization has used 5/3 runs.',
              quota_used: 5,
              quota_limit: 3,
              quota_remaining: 0,
              period_start: '2026-06-01',
              period_end: '2026-06-30'
            }
          }
        }
      }

      const result = parseApiError(error)

      expect(result?.statusCode).toBe(402)
      // The flat structured code overrides the 402 PAYMENT_REQUIRED default
      expect(result?.errorCode).toBe('QUOTA_EXCEEDED')
      expect(result?.quotaDetails?.quota_used).toBe(5)
      expect(result?.quotaDetails?.quota_limit).toBe(3)
      expect(result?.quotaDetails?.period_start).toBe('2026-06-01')
      expect(result?.quotaDetails?.period_end).toBe('2026-06-30')
    })

    it('parses a flat-code 402 NO_PLAN_ASSIGNED detail', () => {
      const error = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            detail: {
              code: 'NO_PLAN_ASSIGNED',
              description:
                'No subscription plan is assigned to your organization.'
            }
          }
        }
      }

      const result = parseApiError(error)

      expect(result?.statusCode).toBe(402)
      expect(result?.errorCode).toBe('NO_PLAN_ASSIGNED')
      expect(result?.message).toBe(
        'No subscription plan is assigned to your organization.'
      )
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

    it('defaults server object details without a description', () => {
      const error = {
        isAxiosError: true,
        message: 'Internal Server Error',
        response: {
          status: 500,
          data: {
            detail: {}
          }
        }
      }

      const result = parseApiError(error)

      expect(result?.message).toBe('Internal server error')
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
        'Contact your AppSecAI representative to upgrade or renew your plan'
      )
      expect(result).not.toContain('http')
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
        'Contact your AppSecAI representative to upgrade or renew your plan'
      )
      expect(result).not.toContain('http')
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
        'Contact your AppSecAI representative to upgrade or renew your plan'
      )
      expect(result).not.toContain('http')
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
      expect(result).not.toContain('status.appsecai.net')
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

    it('formats structured errors with default description', () => {
      const error = {
        statusCode: 400,
        errorCode: 'PLAN_EXPIRED',
        message: '',
        structuredDetails: {
          code: 'PLAN_EXPIRED'
        }
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        '[Submit Analysis for Processing] [PLAN_EXPIRED] The request could not be completed. Contact support: support@appsecai.io if this persists.'
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

    it('formats a 401 authentication error without suggesting retry', () => {
      const error = {
        statusCode: 401,
        message: 'Request failed with status code 401'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('AUTHENTICATION FAILED')
      expect(result).toContain('could not be authenticated')
      expect(result).toContain('GitHub App is installed')
      expect(result).toContain('https://github.com/apps/appsecai-app')
      expect(result).toContain('id-token')
      expect(result).toContain('support@appsecai.io')
      expect(result).not.toMatch(/try again/i)
    })

    it('formats a 403 NO_ELIGIBLE_ORG denial with actionable plan guidance', () => {
      const error = {
        statusCode: 403,
        errorCode: 'NO_ELIGIBLE_ORG',
        // Empty/non-actionable message → must map by code
        message: 'Request failed with status code 403'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('[NO_ELIGIBLE_ORG]')
      expect(result).toContain('ACCESS DENIED')
      expect(result).toContain(
        'does not have an active plan or the access required to run AppSecAI'
      )
      expect(result).toContain('Contact your AppSecAI representative')
      // Critical: never tell the user to "try again" for a permanent denial
      expect(result).not.toMatch(/try again/i)
      expect(result).not.toContain('An error occurred. Please try again.')
    })

    it('surfaces the server-provided detail for a 403 when present', () => {
      const error = {
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: 'Your organization seat limit has been reached.'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('[FORBIDDEN]')
      expect(result).toContain('Your organization seat limit has been reached.')
      expect(result).not.toMatch(/try again/i)
    })

    it('formats a generic 403 (unknown code) with authorization guidance', () => {
      const error = {
        statusCode: 403,
        message: 'Forbidden'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('ACCESS DENIED')
      expect(result).toContain('was not authorized')
      expect(result).toContain('Contact your AppSecAI representative')
      expect(result).not.toMatch(/try again/i)
    })

    it('formats a 404 not-found error with actionable guidance', () => {
      const error = {
        statusCode: 404,
        message: 'Request failed with status code 404'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('NOT FOUND')
      expect(result).toContain('was not found')
      expect(result).toContain('api-url')
      expect(result).toContain('GitHub App is installed')
      expect(result).toContain('https://github.com/apps/appsecai-app')
    })

    it('formats a 408 request timeout error and allows retry guidance', () => {
      const error = {
        statusCode: 408,
        message: 'Request failed with status code 408'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('REQUEST TIMEOUT')
      expect(result).toContain('took too long to respond')
      // Timeout IS transient, so retry guidance is appropriate here
      expect(result).toMatch(/retry/i)
      expect(result).not.toContain('status.appsecai.net')
    })

    it('formats a 422 validation error without suggesting retry', () => {
      const error = {
        statusCode: 422,
        message: 'SARIF file failed schema validation at runs[0].results'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('INVALID SUBMISSION')
      // Server-provided validation detail must be surfaced
      expect(result).toContain('SARIF file failed schema validation')
      expect(result).toContain('valid JSON/SARIF')
      expect(result).not.toMatch(/try again/i)
    })

    it('formats a 503 server error via the 5xx handler', () => {
      const error = {
        statusCode: 503,
        message: 'Service temporarily unavailable'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('SERVER ERROR')
      expect(result).toContain('Service temporarily unavailable')
      expect(result).not.toContain('status.appsecai.net')
    })
  })

  // Superset: the submit channel returns ALL plan/quota/billing denials at
  // HTTP 402 with a flat structured code. These exact-output assertions lock
  // the rendered block per code so the CLI and Fenix docs can mirror them.
  describe('formatErrorMessage 402 flat-code routing', () => {
    const prefixLabel = '[Submit Analysis for Processing]'

    it('routes 402 QUOTA_EXCEEDED to the QUOTA EXCEEDED block with usage', () => {
      const error = {
        statusCode: 402,
        errorCode: 'QUOTA_EXCEEDED',
        message: 'Organization has used 5/3 runs.',
        quotaDetails: {
          quota_used: 5,
          quota_limit: 3,
          period_start: '2026-06-01',
          period_end: '2026-06-30'
        }
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] QUOTA EXCEEDED',
          'Your organization has reached its run limit for this billing period.',
          '',
          'Current Usage: 5 runs used / 3 runs available',
          'Period: 2026-06-01 to 2026-06-30',
          '',
          'To resolve:',
          '- Contact your AppSecAI representative to upgrade or renew your plan',
          '- Contact support: support@appsecai.io'
        ].join('\n')
      )
      // Must NOT be mislabeled as a billing problem
      expect(result).not.toContain('PAYMENT REQUIRED')
    })

    it('routes 402 QUOTA_EXCEEDED without usage and never prints N/A', () => {
      const error = {
        statusCode: 402,
        errorCode: 'QUOTA_EXCEEDED',
        message: 'Run quota exceeded.',
        quotaDetails: undefined
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] QUOTA EXCEEDED',
          'Your organization has reached its run limit for this billing period.',
          '',
          'To resolve:',
          '- Contact your AppSecAI representative to upgrade or renew your plan',
          '- Contact support: support@appsecai.io'
        ].join('\n')
      )
      expect(result).not.toContain('N/A')
    })

    it('routes 402 NO_PLAN_ASSIGNED to ACCESS DENIED with assign-plan guidance', () => {
      const error = {
        statusCode: 402,
        errorCode: 'NO_PLAN_ASSIGNED',
        message: 'No subscription plan is assigned to your organization.'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] [NO_PLAN_ASSIGNED] ACCESS DENIED',
          'No subscription plan is assigned to your organization.',
          '',
          'This is not a transient error and will not be fixed by retrying.',
          'To resolve:',
          "- Assign a plan to your organization (ask your admin if you don't manage billing).",
          '- Contact your AppSecAI representative or support: support@appsecai.io'
        ].join('\n')
      )
      expect(result).not.toContain('PAYMENT REQUIRED')
      expect(result).not.toContain('Update your payment method')
      expect(result).not.toMatch(/try again/i)
    })

    it('routes 402 PLAN_EXPIRED to ACCESS DENIED with renew guidance', () => {
      const error = {
        statusCode: 402,
        errorCode: 'PLAN_EXPIRED',
        message: "Your organization's plan has expired."
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] [PLAN_EXPIRED] ACCESS DENIED',
          "Your organization's plan has expired.",
          '',
          'This is not a transient error and will not be fixed by retrying.',
          'To resolve:',
          "- Renew your organization's plan.",
          '- Contact your AppSecAI representative or support: support@appsecai.io'
        ].join('\n')
      )
      expect(result).not.toContain('PAYMENT REQUIRED')
      expect(result).not.toMatch(/try again/i)
    })

    it('routes 402 PLAN_INACTIVE to ACCESS DENIED with reactivate guidance', () => {
      const error = {
        statusCode: 402,
        errorCode: 'PLAN_INACTIVE',
        message: "Your organization's plan is not active."
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] [PLAN_INACTIVE] ACCESS DENIED',
          "Your organization's plan is not active.",
          '',
          'This is not a transient error and will not be fixed by retrying.',
          'To resolve:',
          '- Ask your organization admin to reactivate the plan.',
          '- Contact your AppSecAI representative or support: support@appsecai.io'
        ].join('\n')
      )
      expect(result).not.toContain('PAYMENT REQUIRED')
      expect(result).not.toMatch(/try again/i)
    })

    it('routes 402 PAYMENT_REQUIRED to the PAYMENT REQUIRED block', () => {
      const error = {
        statusCode: 402,
        errorCode: 'PAYMENT_REQUIRED',
        message: 'Your subscription has expired'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] PAYMENT REQUIRED',
          'Your subscription has expired',
          '',
          'To resolve:',
          '- Contact your AppSecAI representative to upgrade or renew your plan',
          '- Contact support: support@appsecai.io'
        ].join('\n')
      )
    })

    it('routes a 402 with no recognized code to PAYMENT REQUIRED (default)', () => {
      const error = {
        statusCode: 402,
        message: 'Payment required'
      }

      const result = formatErrorMessage(error, prefixLabel)

      expect(result).toContain('PAYMENT REQUIRED')
      expect(result).toContain(
        'Contact your AppSecAI representative to upgrade or renew your plan'
      )
    })
  })

  // Superset: the future ENTITLEMENT_DENIED envelope (code=ENTITLEMENT_DENIED,
  // reason_code + remediation) maps to the same renderers via parseApiError.
  describe('ENTITLEMENT_DENIED envelope routing', () => {
    const prefixLabel = '[Submit Analysis for Processing]'

    it('maps a 403 ENTITLEMENT_DENIED/no_plan through ACCESS DENIED (not a generic fallback)', () => {
      const error = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            detail: {
              code: 'ENTITLEMENT_DENIED',
              reason_code: 'no_plan',
              remediation:
                'Assign a plan to your organization in the AppSecAI portal.'
            }
          }
        }
      }

      const parsed = parseApiError(error)
      expect(parsed?.errorCode).toBe('NO_PLAN_ASSIGNED')

      const result = formatErrorMessage(parsed!, prefixLabel)

      expect(result).toBe(
        [
          '[Submit Analysis for Processing] [NO_PLAN_ASSIGNED] ACCESS DENIED',
          'Assign a plan to your organization in the AppSecAI portal.',
          '',
          'This is not a transient error and will not be fixed by retrying.',
          'To resolve:',
          "- Assign a plan to your organization (ask your admin if you don't manage billing).",
          '- Contact your AppSecAI representative or support: support@appsecai.io'
        ].join('\n')
      )
      // Regression guard: must not be the useless generic structured fallback
      expect(result).not.toContain('An error occurred. Please try again.')
      expect(result).not.toContain('[ENTITLEMENT_DENIED]')
    })

    it('maps a 403 ENTITLEMENT_DENIED/plan_inactive through ACCESS DENIED', () => {
      const error = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            detail: {
              code: 'ENTITLEMENT_DENIED',
              reason_code: 'plan_inactive',
              remediation: 'Ask your admin to reactivate the plan.'
            }
          }
        }
      }

      const parsed = parseApiError(error)
      expect(parsed?.errorCode).toBe('PLAN_INACTIVE')

      const result = formatErrorMessage(parsed!, prefixLabel)
      expect(result).toContain('[PLAN_INACTIVE] ACCESS DENIED')
      expect(result).toContain('Ask your admin to reactivate the plan.')
      expect(result).toContain(
        '- Ask your organization admin to reactivate the plan.'
      )
      expect(result).not.toMatch(/try again/i)
    })

    it('maps a 429 ENTITLEMENT_DENIED/quota_exceeded through QUOTA EXCEEDED with usage', () => {
      const error = {
        isAxiosError: true,
        message: 'Too Many Requests',
        response: {
          status: 429,
          data: {
            detail: {
              code: 'ENTITLEMENT_DENIED',
              reason_code: 'quota_exceeded',
              remediation: 'Upgrade your plan or wait for the next period.',
              quota_used: 10,
              quota_limit: 10,
              period_start: '2026-06-01',
              period_end: '2026-06-30'
            }
          }
        }
      }

      const parsed = parseApiError(error)
      expect(parsed?.errorCode).toBe('QUOTA_EXCEEDED')
      expect(parsed?.quotaDetails?.quota_used).toBe(10)
      expect(parsed?.quotaDetails?.quota_limit).toBe(10)

      const result = formatErrorMessage(parsed!, prefixLabel)
      expect(result).toContain('QUOTA EXCEEDED')
      expect(result).toContain(
        'Current Usage: 10 runs used / 10 runs available'
      )
      expect(result).toContain('Period: 2026-06-01 to 2026-06-30')
      expect(result).not.toContain('PAYMENT REQUIRED')
    })

    it('maps an envelope invite_required to ONBOARDING_REQUIRED guidance', () => {
      const error = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            detail: {
              code: 'ENTITLEMENT_DENIED',
              reason_code: 'invite_required',
              remediation: 'Redeem your invite code to continue.'
            }
          }
        }
      }

      const parsed = parseApiError(error)
      expect(parsed?.errorCode).toBe('ONBOARDING_REQUIRED')

      const result = formatErrorMessage(parsed!, prefixLabel)
      expect(result).toContain('[ONBOARDING_REQUIRED] ACCESS DENIED')
      expect(result).toContain('Redeem your invite code to continue.')
      expect(result).toContain(
        '- Complete onboarding / redeem your invite code.'
      )
    })
  })

  // Superset: confirm the 404/408/422/500 formatters are unchanged by the
  // 402/403 routing work (exact-output regression guards).
  describe('untouched formatters remain stable', () => {
    const prefixLabel = '[Submit Analysis for Processing]'

    it('404 NOT FOUND block is unchanged', () => {
      const result = formatErrorMessage(
        { statusCode: 404, message: 'Request failed with status code 404' },
        prefixLabel
      )
      expect(result).toBe(
        [
          '[Submit Analysis for Processing] NOT FOUND',
          'The requested resource was not found.',
          '',
          'To resolve:',
          "- Verify the 'api-url' input points to the correct AppSecAI endpoint",
          '- Confirm the AppSecAI GitHub App is installed on this repository: https://github.com/apps/appsecai-app',
          '- Contact support: support@appsecai.io'
        ].join('\n')
      )
    })

    it('408 REQUEST TIMEOUT block omits the removed status-page line', () => {
      const result = formatErrorMessage(
        { statusCode: 408, message: 'Request failed with status code 408' },
        prefixLabel
      )
      expect(result).toBe(
        [
          '[Submit Analysis for Processing] REQUEST TIMEOUT',
          'The server took too long to respond.',
          '',
          'This is usually transient. To resolve:',
          '- Wait a few minutes and retry your request',
          '- If the problem persists, contact support: support@appsecai.io'
        ].join('\n')
      )
    })

    it('422 INVALID SUBMISSION block is unchanged', () => {
      const result = formatErrorMessage(
        {
          statusCode: 422,
          message: 'SARIF file failed schema validation at runs[0].results'
        },
        prefixLabel
      )
      expect(result).toBe(
        [
          '[Submit Analysis for Processing] INVALID SUBMISSION',
          'SARIF file failed schema validation at runs[0].results',
          '',
          'This is not a transient error and will not be fixed by retrying.',
          'To resolve:',
          '- Verify your analysis file is valid JSON/SARIF and follows the expected schema',
          '- Ensure the file is not empty and is within the size limit',
          '- Contact support: support@appsecai.io if the file appears valid'
        ].join('\n')
      )
    })

    it('500 SERVER ERROR block omits the removed status-page line', () => {
      const result = formatErrorMessage(
        {
          statusCode: 500,
          errorCode: 'SERVER_ERROR',
          message: 'Database connection failed'
        },
        prefixLabel
      )
      expect(result).toBe(
        [
          '[Submit Analysis for Processing] SERVER ERROR',
          'Database connection failed',
          '',
          'To resolve:',
          '- Wait a few minutes and retry your request',
          '- If the problem persists, contact support: support@appsecai.io'
        ].join('\n')
      )
    })
  })

  describe('isActionableServerMessage', () => {
    it('rejects empty, whitespace, and undefined messages', () => {
      expect(isActionableServerMessage(undefined)).toBe(false)
      expect(isActionableServerMessage('')).toBe(false)
      expect(isActionableServerMessage('   ')).toBe(false)
    })

    it('rejects axios default status messages and bare HTTP reasons', () => {
      expect(
        isActionableServerMessage('Request failed with status code 403')
      ).toBe(false)
      expect(isActionableServerMessage('Forbidden')).toBe(false)
      expect(isActionableServerMessage('Unauthorized')).toBe(false)
      expect(isActionableServerMessage('Not Found')).toBe(false)
      expect(isActionableServerMessage('Internal Server Error')).toBe(false)
    })

    it('rejects generic "An error occurred" placeholders', () => {
      expect(
        isActionableServerMessage('An error occurred. Please try again.')
      ).toBe(false)
      expect(isActionableServerMessage('An unexpected error occurred')).toBe(
        false
      )
    })

    it('accepts specific, actionable server messages', () => {
      expect(
        isActionableServerMessage(
          'Your organization does not have an active plan.'
        )
      ).toBe(true)
      expect(
        isActionableServerMessage('SARIF file exceeds the 50MB size limit')
      ).toBe(true)
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
      expect(errorCall).toContain(
        'Contact your AppSecAI representative to upgrade or renew your plan'
      )
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
      expect(errorCall).toContain(
        'Contact your AppSecAI representative to upgrade or renew your plan'
      )
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
      expect(errorCall).not.toContain('status.appsecai.net')
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

    it('adds fallback guidance for structured unknown errors with empty descriptions', async () => {
      const structuredError = {
        isAxiosError: true,
        message: 'Bad Request',
        response: {
          status: 418,
          data: {
            detail: {
              code: 'UNKNOWN',
              description: '  '
            }
          }
        }
      }

      axios.post.mockRejectedValue(structuredError)

      await expect(submitRun(Buffer.from('{}'), 'file')).rejects.toThrow(
        '[UNKNOWN] The request could not be completed. Contact support: support@appsecai.io if this persists.'
      )
    })

    it('logs structured error metadata for debugging', async () => {
      const structuredError = {
        isAxiosError: true,
        message: 'Bad Request',
        response: {
          status: 400,
          data: {
            detail: {
              code: 'PLAN_EXPIRED',
              description: '',
              organization_id: 'org-123',
              expires_at: '2025-12-01T00:00:00Z',
              status: 'expired',
              owner: 'security-team',
              owner_type: 'team'
            }
          }
        }
      }

      axios.post.mockRejectedValue(structuredError)

      await expect(submitRun(Buffer.from('{}'), 'file')).rejects.toThrow(
        '[PLAN_EXPIRED] The request could not be completed. Contact support: support@appsecai.io if this persists.'
      )
      expect(core.debug).toHaveBeenCalledWith('Organization ID: org-123')
      expect(core.debug).toHaveBeenCalledWith(
        'Plan expires at: 2025-12-01T00:00:00Z'
      )
      expect(core.debug).toHaveBeenCalledWith('Plan status: expired')
      expect(core.debug).toHaveBeenCalledWith('Owner: security-team')
      expect(core.debug).toHaveBeenCalledWith('Owner type: team')
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

    // Reproduces the 2026-05-31 production incident: a 403 NO_ELIGIBLE_ORG
    // denial with an empty description previously surfaced as
    // "[FORBIDDEN] An error occurred. Please try again." (misleading - implies
    // a transient failure for a permanent authorization denial).
    it('produces an actionable 403 message for an org with no eligible plan', async () => {
      const authError = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            detail: {
              code: 'NO_ELIGIBLE_ORG',
              description: '',
              organization_id: 'org-789'
            }
          }
        }
      }

      axios.post.mockRejectedValue(authError)

      const inputBuffer = Buffer.from(JSON.stringify({ key: 'value' }))

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'ACCESS DENIED'
      )

      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('[NO_ELIGIBLE_ORG]')
      expect(errorCall).toContain(
        'does not have an active plan or the access required to run AppSecAI'
      )
      expect(errorCall).toContain('Contact your AppSecAI representative')
      // Regression guard for the incident: these strings must never appear
      expect(errorCall).not.toContain('An error occurred. Please try again.')
      expect(errorCall).not.toMatch(/try again/i)
      // Organization id is logged for diagnostics, not shown to the user
      expect(core.debug).toHaveBeenCalledWith('Organization ID: org-789')
    })

    it('surfaces a server-provided 403 reason string when present', async () => {
      const authError = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            detail:
              'Your AppSecAI subscription does not include this repository.'
          }
        }
      }

      axios.post.mockRejectedValue(authError)

      const inputBuffer = Buffer.from(JSON.stringify({ key: 'value' }))

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'ACCESS DENIED'
      )

      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain(
        'Your AppSecAI subscription does not include this repository.'
      )
      expect(errorCall).not.toMatch(/try again/i)
    })

    it('produces an actionable 401 authentication message', async () => {
      const authError = {
        isAxiosError: true,
        message: 'Request failed with status code 401',
        response: { status: 401, data: { detail: '' } }
      }

      axios.post.mockRejectedValue(authError)

      const inputBuffer = Buffer.from(JSON.stringify({ key: 'value' }))

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'AUTHENTICATION FAILED'
      )

      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('GitHub App is installed')
      expect(errorCall).not.toMatch(/try again/i)
    })

    it('produces an actionable 422 validation message surfacing server detail', async () => {
      const validationError = {
        isAxiosError: true,
        message: 'Request failed with status code 422',
        response: {
          status: 422,
          data: { detail: 'results[0].ruleId is required' }
        }
      }

      axios.post.mockRejectedValue(validationError)

      const inputBuffer = Buffer.from(JSON.stringify({ key: 'value' }))

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'INVALID SUBMISSION'
      )

      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('results[0].ruleId is required')
      expect(errorCall).not.toMatch(/try again/i)
    })

    it('renders a 402 QUOTA_EXCEEDED submit response as QUOTA EXCEEDED (not PAYMENT REQUIRED)', async () => {
      const quotaError = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            detail: {
              code: 'QUOTA_EXCEEDED',
              description: 'Organization has used 5/3 runs.',
              quota_used: 5,
              quota_limit: 3,
              period_start: '2026-06-01',
              period_end: '2026-06-30'
            }
          }
        }
      }

      axios.post.mockRejectedValue(quotaError)

      await expect(
        submitRun(Buffer.from(JSON.stringify({ key: 'value' })), 'file')
      ).rejects.toThrow('QUOTA EXCEEDED')

      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('QUOTA EXCEEDED')
      expect(errorCall).toContain(
        'Current Usage: 5 runs used / 3 runs available'
      )
      expect(errorCall).toContain('Period: 2026-06-01 to 2026-06-30')
      expect(errorCall).not.toContain('PAYMENT REQUIRED')
    })

    it('renders a 402 NO_PLAN_ASSIGNED submit response as ACCESS DENIED', async () => {
      const planError = {
        isAxiosError: true,
        message: 'Payment Required',
        response: {
          status: 402,
          data: {
            detail: {
              code: 'NO_PLAN_ASSIGNED',
              description:
                'No subscription plan is assigned to your organization.'
            }
          }
        }
      }

      axios.post.mockRejectedValue(planError)

      await expect(
        submitRun(Buffer.from(JSON.stringify({ key: 'value' })), 'file')
      ).rejects.toThrow('ACCESS DENIED')

      const errorCall = core.error.mock.calls[0][0]
      expect(errorCall).toContain('[NO_PLAN_ASSIGNED] ACCESS DENIED')
      expect(errorCall).toContain(
        "- Assign a plan to your organization (ask your admin if you don't manage billing)."
      )
      expect(errorCall).not.toContain('PAYMENT REQUIRED')
      expect(errorCall).not.toContain('Update your payment method')
    })

    it('logs processing steps included in an error response', async () => {
      const errorWithSteps = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            detail: {
              code: 'NO_ELIGIBLE_ORG',
              steps: [{ name: 'submit', status: 'failed', detail: 'denied' }]
            }
          }
        }
      }

      axios.post.mockRejectedValue(errorWithSteps)

      const inputBuffer = Buffer.from(JSON.stringify({ key: 'value' }))

      await expect(submitRun(inputBuffer, 'file')).rejects.toThrow(
        'ACCESS DENIED'
      )
      // logSteps is mocked; assert it was invoked with the parsed step list
      const { logSteps } = await import('../src/utils')
      expect(logSteps).toHaveBeenCalledWith(
        [{ name: 'submit', status: 'failed', detail: 'denied' }],
        'Submit Analysis for Processing'
      )
    })
  })
})
