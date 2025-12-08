// __tests__/input.test.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

/**
 * Unit tests for src/input.ts
 */

import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'

jest.unstable_mockModule('@actions/core', () => core)

const {
  getApiUrl,
  getFile,
  getToken,
  getMode,
  getUseTriageCc,
  getTriageMethod,
  getUseRemediateCc,
  getRemediateMethod,
  getUseValidateCc,
  getValidateMethod,
  getUseRemediateLoopCc,
  getAutoCreatePrs,
  getDebug
} = await import('../src/input.js')
const { ProcessingModeExternal } = await import('../src/types.js')

describe('input.ts', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset mocks
    core.getInput.mockReset()
    core.warning.mockReset()
    // Reset environment variables
    process.env = { ...originalEnv }
    // Clear all INPUT_* and workflow config env vars
    const configEnvVars = [
      'INPUT_FILE',
      'INPUT_API_URL',
      'INPUT_TOKEN',
      'INPUT_DEBUG',
      'INPUT_PROCESSING_MODE',
      'INPUT_USE_TRIAGE_CC',
      'INPUT_TRIAGE_METHOD',
      'INPUT_USE_REMEDIATE_CC',
      'INPUT_REMEDIATE_METHOD',
      'INPUT_USE_VALIDATE_CC',
      'INPUT_VALIDATE_METHOD',
      'INPUT_USE_REMEDIATE_LOOP_CC',
      'INPUT_AUTO_CREATE_PRS',
      'PROCESSING_MODE',
      'USE_TRIAGE_CC',
      'TRIAGE_METHOD',
      'USE_REMEDIATE_CC',
      'REMEDIATE_METHOD',
      'USE_VALIDATE_CC',
      'VALIDATE_METHOD',
      'USE_REMEDIATE_LOOP_CC',
      'AUTO_CREATE_PRS'
    ]
    configEnvVars.forEach((key) => {
      delete process.env[key]
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('getApiUrl', () => {
    it('returns the api-url input from core.getInput', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'api-url') return 'https://example.com'
        return ''
      })
      expect(getApiUrl()).toBe('https://example.com')
    })

    it('prefers INPUT_API_URL environment variable over core.getInput', () => {
      process.env.INPUT_API_URL = 'https://env-example.com'
      core.getInput.mockReturnValue('https://core-example.com')
      expect(getApiUrl()).toBe('https://env-example.com')
    })
  })

  describe('getFile', () => {
    it('returns the file input from core.getInput', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'file') return 'report.json'
        return ''
      })
      expect(getFile()).toBe('report.json')
    })

    it('prefers INPUT_FILE environment variable over core.getInput', () => {
      process.env.INPUT_FILE = 'env-report.json'
      core.getInput.mockReturnValue('core-report.json')
      expect(getFile()).toBe('env-report.json')
    })
  })

  describe('getToken', () => {
    it('returns the token input from core.getInput', () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'token') return 'my-token'
        return ''
      })
      expect(getToken()).toBe('my-token')
    })

    it('prefers INPUT_TOKEN environment variable over core.getInput', () => {
      process.env.INPUT_TOKEN = 'env-token'
      core.getInput.mockReturnValue('core-token')
      expect(getToken()).toBe('env-token')
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

    it('returns default when mode is empty', () => {
      core.getInput.mockReturnValue('')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL)
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('prefers PROCESSING_MODE workflow env var', () => {
      process.env.PROCESSING_MODE = ProcessingModeExternal.GROUP_ONLY
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_ONLY)
    })

    it('prefers INPUT_PROCESSING_MODE over core.getInput', () => {
      process.env.INPUT_PROCESSING_MODE = ProcessingModeExternal.GROUP_ONLY
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_ONLY)
    })

    it('prefers INPUT_PROCESSING_MODE environment variable', () => {
      process.env.INPUT_PROCESSING_MODE = ProcessingModeExternal.GROUP_ONLY
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_ONLY)
    })
  })

  describe('AI solver variant getters', () => {
    describe('getUseTriageCc', () => {
      it('returns true when use-triage-cc is true', () => {
        process.env.USE_TRIAGE_CC = 'true'
        expect(getUseTriageCc()).toBe(true)
      })

      it('returns false when use-triage-cc is false', () => {
        process.env.USE_TRIAGE_CC = 'false'
        expect(getUseTriageCc()).toBe(false)
      })

      it('returns true by default', () => {
        core.getInput.mockReturnValue('')
        expect(getUseTriageCc()).toBe(true)
      })

      it('prefers USE_TRIAGE_CC workflow env var', () => {
        process.env.USE_TRIAGE_CC = 'false'
        core.getInput.mockReturnValue('true')
        expect(getUseTriageCc()).toBe(false)
      })

      it('prefers INPUT_USE_TRIAGE_CC environment variable', () => {
        process.env.INPUT_USE_TRIAGE_CC = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUseTriageCc()).toBe(true)
      })
    })

    describe('getTriageMethod', () => {
      it('returns the triage-method input', () => {
        process.env.TRIAGE_METHOD = 'advanced'
        expect(getTriageMethod()).toBe('advanced')
      })

      it('returns ml_based by default', () => {
        core.getInput.mockReturnValue('')
        expect(getTriageMethod()).toBe('ml_based')
      })

      it('handles baseline method', () => {
        process.env.TRIAGE_METHOD = 'baseline'
        expect(getTriageMethod()).toBe('baseline')
      })

      it('handles rule_based method', () => {
        process.env.TRIAGE_METHOD = 'rule_based'
        expect(getTriageMethod()).toBe('rule_based')
      })

      it('prefers TRIAGE_METHOD workflow env var', () => {
        process.env.TRIAGE_METHOD = 'advanced'
        core.getInput.mockReturnValue('baseline')
        expect(getTriageMethod()).toBe('advanced')
      })

      it('prefers INPUT_TRIAGE_METHOD environment variable', () => {
        process.env.INPUT_TRIAGE_METHOD = 'advanced'
        core.getInput.mockReturnValue('baseline')
        expect(getTriageMethod()).toBe('advanced')
      })
    })

    describe('getUseRemediateCc', () => {
      it('returns true when use-remediate-cc is true', () => {
        process.env.USE_REMEDIATE_CC = 'true'
        expect(getUseRemediateCc()).toBe(true)
      })

      it('returns false by default', () => {
        core.getInput.mockReturnValue('')
        expect(getUseRemediateCc()).toBe(false)
      })

      it('prefers USE_REMEDIATE_CC workflow env var', () => {
        process.env.USE_REMEDIATE_CC = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUseRemediateCc()).toBe(true)
      })

      it('prefers INPUT_USE_REMEDIATE_CC environment variable', () => {
        process.env.INPUT_USE_REMEDIATE_CC = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUseRemediateCc()).toBe(true)
      })
    })

    describe('getRemediateMethod', () => {
      it('returns the remediate-method input', () => {
        process.env.REMEDIATE_METHOD = 'baseline'
        expect(getRemediateMethod()).toBe('baseline')
      })

      it('returns advanced by default', () => {
        core.getInput.mockReturnValue('')
        expect(getRemediateMethod()).toBe('advanced')
      })

      it('prefers REMEDIATE_METHOD workflow env var', () => {
        process.env.REMEDIATE_METHOD = 'baseline'
        core.getInput.mockReturnValue('advanced')
        expect(getRemediateMethod()).toBe('baseline')
      })

      it('prefers INPUT_REMEDIATE_METHOD environment variable', () => {
        process.env.INPUT_REMEDIATE_METHOD = 'advanced'
        core.getInput.mockReturnValue('baseline')
        expect(getRemediateMethod()).toBe('advanced')
      })
    })

    describe('getUseValidateCc', () => {
      it('returns true when use-validate-cc is true', () => {
        process.env.USE_VALIDATE_CC = 'true'
        expect(getUseValidateCc()).toBe(true)
      })

      it('returns false by default', () => {
        core.getInput.mockReturnValue('')
        expect(getUseValidateCc()).toBe(false)
      })

      it('prefers USE_VALIDATE_CC workflow env var', () => {
        process.env.USE_VALIDATE_CC = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUseValidateCc()).toBe(true)
      })

      it('prefers INPUT_USE_VALIDATE_CC environment variable', () => {
        process.env.INPUT_USE_VALIDATE_CC = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUseValidateCc()).toBe(true)
      })
    })

    describe('getValidateMethod', () => {
      it('returns the validate-method input', () => {
        process.env.VALIDATE_METHOD = 'advanced'
        expect(getValidateMethod()).toBe('advanced')
      })

      it('returns baseline by default', () => {
        core.getInput.mockReturnValue('')
        expect(getValidateMethod()).toBe('baseline')
      })

      it('prefers VALIDATE_METHOD workflow env var', () => {
        process.env.VALIDATE_METHOD = 'advanced'
        core.getInput.mockReturnValue('baseline')
        expect(getValidateMethod()).toBe('advanced')
      })

      it('prefers INPUT_VALIDATE_METHOD environment variable', () => {
        process.env.INPUT_VALIDATE_METHOD = 'advanced'
        core.getInput.mockReturnValue('baseline')
        expect(getValidateMethod()).toBe('advanced')
      })
    })

    describe('getUseRemediateLoopCc', () => {
      it('returns true when use-remediate-loop-cc is true', () => {
        process.env.USE_REMEDIATE_LOOP_CC = 'true'
        expect(getUseRemediateLoopCc()).toBe(true)
      })

      it('returns false when use-remediate-loop-cc is false', () => {
        process.env.USE_REMEDIATE_LOOP_CC = 'false'
        expect(getUseRemediateLoopCc()).toBe(false)
      })

      it('returns true by default', () => {
        core.getInput.mockReturnValue('')
        expect(getUseRemediateLoopCc()).toBe(true)
      })

      it('prefers USE_REMEDIATE_LOOP_CC workflow env var', () => {
        process.env.USE_REMEDIATE_LOOP_CC = 'false'
        core.getInput.mockReturnValue('true')
        expect(getUseRemediateLoopCc()).toBe(false)
      })

      it('prefers INPUT_USE_REMEDIATE_LOOP_CC environment variable', () => {
        process.env.INPUT_USE_REMEDIATE_LOOP_CC = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUseRemediateLoopCc()).toBe(true)
      })
    })

    describe('getAutoCreatePrs', () => {
      it('returns true when auto-create-prs is true', () => {
        process.env.AUTO_CREATE_PRS = 'true'
        expect(getAutoCreatePrs()).toBe(true)
      })

      it('returns false when auto-create-prs is false', () => {
        process.env.AUTO_CREATE_PRS = 'false'
        expect(getAutoCreatePrs()).toBe(false)
      })

      it('returns true by default', () => {
        core.getInput.mockReturnValue('')
        expect(getAutoCreatePrs()).toBe(true)
      })

      it('prefers AUTO_CREATE_PRS workflow env var', () => {
        process.env.AUTO_CREATE_PRS = 'false'
        core.getInput.mockReturnValue('true')
        expect(getAutoCreatePrs()).toBe(false)
      })

      it('prefers INPUT_AUTO_CREATE_PRS environment variable', () => {
        process.env.INPUT_AUTO_CREATE_PRS = 'false'
        core.getInput.mockReturnValue('true')
        expect(getAutoCreatePrs()).toBe(false)
      })
    })

    describe('getDebug', () => {
      it('returns true when debug is true', () => {
        core.getInput.mockReturnValue('true')
        expect(getDebug()).toBe(true)
      })

      it('returns false when debug is false', () => {
        core.getInput.mockReturnValue('false')
        expect(getDebug()).toBe(false)
      })

      it('returns false by default when value is invalid', () => {
        core.getInput.mockReturnValue('invalid')
        expect(getDebug()).toBe(false)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid debug value')
        )
      })

      it('returns false when debug is empty string', () => {
        core.getInput.mockReturnValue('')
        expect(getDebug()).toBe(false)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid debug value')
        )
      })

      it('prefers INPUT_DEBUG environment variable', () => {
        process.env.INPUT_DEBUG = 'true'
        core.getInput.mockReturnValue('false')
        expect(getDebug()).toBe(true)
      })
    })
  })
})
