/**
 * Unit tests for src/version-service.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import axios from '../__fixtures__/axios'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('axios', () => ({ default: axios }))

// Mock version.ts to control CLIENT_VERSION for tests
jest.unstable_mockModule('../src/version.js', () => ({
  CLIENT_VERSION: '1.0.0',
  VERSION: '1.0.0',
  MIN_SERVER_API_VERSION: 'v1'
}))

const { checkCompatibilityFromHeaders, fetchAndLogServerVersion } =
  await import('../src/version-service.js')

describe('version-service.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkCompatibilityFromHeaders', () => {
    it('should not warn when client version is compatible', () => {
      const headers = {
        'x-api-version': 'v1',
        'x-min-client-version': '0.5.0'
      }

      checkCompatibilityFromHeaders(headers)

      expect(core.warning).not.toHaveBeenCalled()
      expect(core.debug).toHaveBeenCalledWith(
        'Server API: v1, X-Min-Client-Version: 0.5.0'
      )
    })

    it('should warn when client version is below minimum', () => {
      const headers = {
        'x-api-version': 'v2',
        'x-min-client-version': '2.0.0'
      }

      checkCompatibilityFromHeaders(headers)

      expect(core.warning).toHaveBeenCalledWith(
        'Client version 1.0.0 is below minimum required version 2.0.0. ' +
          'Please update submit-run-action.'
      )
      expect(core.debug).toHaveBeenCalledWith(
        'Server API: v2, X-Min-Client-Version: 2.0.0'
      )
    })

    it('should handle missing min-client-version header', () => {
      const headers = {
        'x-api-version': 'v1'
      }

      checkCompatibilityFromHeaders(headers)

      expect(core.warning).not.toHaveBeenCalled()
      expect(core.debug).toHaveBeenCalledWith(
        'Server API: v1, X-Min-Client-Version: not set'
      )
    })

    it('should handle missing api-version header', () => {
      const headers = {
        'x-min-client-version': '0.5.0'
      }

      checkCompatibilityFromHeaders(headers)

      expect(core.warning).not.toHaveBeenCalled()
      expect(core.debug).toHaveBeenCalledWith(
        'Server API: unknown, X-Min-Client-Version: 0.5.0'
      )
    })

    it('should handle empty headers object', () => {
      const headers = {}

      checkCompatibilityFromHeaders(headers)

      expect(core.warning).not.toHaveBeenCalled()
      expect(core.debug).toHaveBeenCalledWith(
        'Server API: unknown, X-Min-Client-Version: not set'
      )
    })

    it('should handle version strings with v prefix', () => {
      const headers = {
        'x-api-version': 'v2',
        'x-min-client-version': 'v0.9.0'
      }

      checkCompatibilityFromHeaders(headers)

      expect(core.warning).not.toHaveBeenCalled()
      expect(core.debug).toHaveBeenCalledWith(
        'Server API: v2, X-Min-Client-Version: v0.9.0'
      )
    })

    it('should handle invalid semver gracefully', () => {
      const headers = {
        'x-api-version': 'v1',
        'x-min-client-version': 'invalid-version'
      }

      checkCompatibilityFromHeaders(headers)

      // Should not throw and should not warn (coerce will return null)
      expect(core.warning).not.toHaveBeenCalled()
      expect(core.debug).toHaveBeenCalled()
    })
  })

  describe('fetchAndLogServerVersion', () => {
    it('should fetch and log server version successfully', async () => {
      const mockResponse = {
        data: {
          version: '2.1.0',
          api: {
            version: 'v2',
            min_compatible_client: '1.0.0'
          },
          git: {
            sha_short: 'abc1234'
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.example.com/version',
        {
          timeout: 5000
        }
      )
      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa v2.1.0 (API v2)'
      )
      expect(core.warning).not.toHaveBeenCalled()
      expect(result).toEqual({
        apiVersion: 'v2',
        serviceVersion: '2.1.0',
        minClientVersion: '1.0.0',
        gitSha: 'abc1234'
      })
    })

    it('should warn when client version is incompatible', async () => {
      const mockResponse = {
        data: {
          version: '3.0.0',
          api: {
            version: 'v3',
            min_compatible_client: '2.0.0'
          },
          git: {
            sha_short: 'def5678'
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa v3.0.0 (API v3)'
      )
      expect(core.warning).toHaveBeenCalledWith(
        'Client version 1.0.0 may not be compatible with server. ' +
          'Minimum: 2.0.0'
      )
      expect(result).toEqual({
        apiVersion: 'v3',
        serviceVersion: '3.0.0',
        minClientVersion: '2.0.0',
        gitSha: 'def5678'
      })
    })

    it('should handle missing optional fields', async () => {
      const mockResponse = {
        data: {
          version: '1.5.0',
          api: {
            version: 'v1'
            // min_compatible_client missing
          },
          git: {
            // sha_short missing
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa v1.5.0 (API v1)'
      )
      expect(core.warning).not.toHaveBeenCalled()
      expect(result).toEqual({
        apiVersion: 'v1',
        serviceVersion: '1.5.0',
        minClientVersion: 'unknown',
        gitSha: 'unknown'
      })
    })

    it('should handle missing api object', async () => {
      const mockResponse = {
        data: {
          version: '1.0.0'
          // api object missing
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa v1.0.0 (API unknown)'
      )
      expect(result).toEqual({
        apiVersion: 'unknown',
        serviceVersion: '1.0.0',
        minClientVersion: 'unknown',
        gitSha: 'unknown'
      })
    })

    it('should return null on network error', async () => {
      const error = new Error('Network error')
      axios.get.mockRejectedValue(error)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.debug).toHaveBeenCalledWith(
        expect.stringContaining('Could not fetch server version')
      )
      expect(result).toBeNull()
    })

    it('should return null on timeout', async () => {
      const error = Object.assign(new Error('timeout'), {
        code: 'ECONNABORTED'
      })
      axios.get.mockRejectedValue(error)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.debug).toHaveBeenCalledWith(
        expect.stringContaining('Could not fetch server version')
      )
      expect(result).toBeNull()
    })

    it('should return null on 404 error', async () => {
      const error = {
        response: {
          status: 404
        },
        message: 'Not found'
      }
      axios.get.mockRejectedValue(error)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.debug).toHaveBeenCalledWith(
        expect.stringContaining('Could not fetch server version')
      )
      expect(result).toBeNull()
    })

    it('should handle version strings with various formats', async () => {
      const mockResponse = {
        data: {
          version: 'v2.0.0', // With v prefix
          api: {
            version: '2',
            min_compatible_client: 'v1' // With v prefix
          },
          git: {
            sha_short: 'abc1234'
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa v2.0.0 (API 2)'
      )
      expect(core.warning).not.toHaveBeenCalled()
      expect(result).not.toBeNull()
    })

    it('should handle completely empty response', async () => {
      const mockResponse = {
        data: {}
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa unknown (API unknown)'
      )
      expect(result).toEqual({
        apiVersion: 'unknown',
        serviceVersion: 'unknown',
        minClientVersion: 'unknown',
        gitSha: 'unknown'
      })
    })

    it('should handle invalid semver in comparison gracefully', async () => {
      const mockResponse = {
        data: {
          version: '2.0.0',
          api: {
            version: 'v2',
            min_compatible_client: 'not-a-version'
          },
          git: {
            sha_short: 'abc1234'
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await fetchAndLogServerVersion('https://api.example.com')

      expect(core.info).toHaveBeenCalledWith(
        'Connected to Medusa v2.0.0 (API v2)'
      )
      // Should not warn because semver.coerce will return null
      expect(core.warning).not.toHaveBeenCalled()
      expect(result).toEqual({
        apiVersion: 'v2',
        serviceVersion: '2.0.0',
        minClientVersion: 'not-a-version',
        gitSha: 'abc1234'
      })
    })
  })
})
