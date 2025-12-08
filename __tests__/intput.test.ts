/**
 * Unit tests for src/input.ts
 */

import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'

jest.unstable_mockModule('@actions/core', () => core)

const { getApiUrl, getMode } = await import('../src/input.js')
const { ProcessingModeExternal } = await import('../src/types.js')

describe('input.ts', () => {
  beforeEach(() => {
    core.getInput.mockReset()
    core.warning.mockReset()
  })

  describe('getApiUrl', () => {
    it('returns the api-url input', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'api-url') return 'https://example.com'
        return ''
      })
      expect(getApiUrl()).toBe('https://example.com')
      expect(core.getInput).toHaveBeenCalledWith('api-url')
    })
  })

  describe('getMode', () => {
    it('returns the mode if valid', () => {
      core.getInput.mockReturnValue(
        ProcessingModeExternal.INDIVIDUAL_WITHOUT_PUSH
      )
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL_WITHOUT_PUSH)
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('returns default and warns if mode is invalid', () => {
      core.getInput.mockReturnValue('invalid_mode')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Warning: Provided mode "invalid_mode" is not valid'
        )
      )
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Allowed modes are:')
      )
    })

    it('returns default and warns if mode is empty', () => {
      core.getInput.mockReturnValue('')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL)
      expect(core.warning).not.toHaveBeenCalled()
    })
  })
})
