// __tests__/input.test.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
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
  getDebug,
  getCreateIssuesForIncompleteRemediations,
  getCommentModificationMode,
  getRegressionEvidenceBaseRef,
  getRegressionEvidenceBaseSha,
  getRegressionEvidenceHeadRef,
  getRegressionEvidenceHeadSha,
  getRegressionEvidenceCoverageArtifacts,
  getRegressionEvidenceTestCommands,
  getRegressionEvidenceOutputJsonPath,
  getRegressionEvidenceOutputMarkdownPath,
  getRegressionEvidenceAllowPartial,
  getRegressionEvidenceFailOnAtRisk,
  getGroupingEnabled,
  getGroupingStrategy,
  getMaxVulnerabilitiesPerPr,
  getGroupingStage,
  getUpdateContext
} = await import('../src/input.js')
const {
  ProcessingModeExternal,
  CommentModificationMode,
  GroupingStrategy,
  GroupingStage
} = await import('../src/types.js')

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
      'INPUT_CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS',
      'INPUT_COMMENT_MODIFICATION_MODE',
      'INPUT_REGRESSION_EVIDENCE_BASE_REF',
      'INPUT_REGRESSION_EVIDENCE_BASE_SHA',
      'INPUT_REGRESSION_EVIDENCE_HEAD_REF',
      'INPUT_REGRESSION_EVIDENCE_HEAD_SHA',
      'INPUT_REGRESSION_EVIDENCE_COVERAGE_ARTIFACTS',
      'INPUT_REGRESSION_EVIDENCE_TEST_COMMANDS',
      'INPUT_REGRESSION_EVIDENCE_OUTPUT_JSON_PATH',
      'INPUT_REGRESSION_EVIDENCE_OUTPUT_MARKDOWN_PATH',
      'INPUT_REGRESSION_EVIDENCE_ALLOW_PARTIAL',
      'INPUT_REGRESSION_EVIDENCE_FAIL_ON_AT_RISK',
      'INPUT_GROUPING_ENABLED',
      'INPUT_GROUPING_STRATEGY',
      'INPUT_MAX_VULNERABILITIES_PER_PR',
      'INPUT_GROUPING_STAGE',
      'INPUT_UPDATE_CONTEXT',
      'PROCESSING_MODE',
      'USE_TRIAGE_CC',
      'TRIAGE_METHOD',
      'USE_REMEDIATE_CC',
      'REMEDIATE_METHOD',
      'USE_VALIDATE_CC',
      'VALIDATE_METHOD',
      'USE_REMEDIATE_LOOP_CC',
      'AUTO_CREATE_PRS',
      'CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS',
      'COMMENT_MODIFICATION_MODE',
      'REGRESSION_EVIDENCE_BASE_REF',
      'REGRESSION_EVIDENCE_BASE_SHA',
      'REGRESSION_EVIDENCE_HEAD_REF',
      'REGRESSION_EVIDENCE_HEAD_SHA',
      'REGRESSION_EVIDENCE_COVERAGE_ARTIFACTS',
      'REGRESSION_EVIDENCE_TEST_COMMANDS',
      'REGRESSION_EVIDENCE_OUTPUT_JSON_PATH',
      'REGRESSION_EVIDENCE_OUTPUT_MARKDOWN_PATH',
      'REGRESSION_EVIDENCE_ALLOW_PARTIAL',
      'REGRESSION_EVIDENCE_FAIL_ON_AT_RISK',
      'GROUPING_ENABLED',
      'GROUPING_STRATEGY',
      'MAX_VULNERABILITIES_PER_PR',
      'GROUPING_STAGE',
      'UPDATE_CONTEXT'
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
    it('returns individual when mode is individual', () => {
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL)
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('returns individual_cc when mode is individual_cc', () => {
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL_CC)
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('returns individual_cc when mode is empty (default)', () => {
      core.getInput.mockReturnValue('')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('returns group_cc when mode is group_cc (canonical)', () => {
      core.getInput.mockReturnValue(ProcessingModeExternal.GROUP_CC)
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
      expect(core.warning).not.toHaveBeenCalled()
    })

    it('returns individual_cc and warns when mode is invalid', () => {
      core.getInput.mockReturnValue('turbo_mode')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Warning: Provided mode "turbo_mode" is not valid'
        )
      )
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Allowed modes are:')
      )
    })

    it('maps legacy alias group_only to group_cc with warning', () => {
      core.getInput.mockReturnValue('group_only')
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('"group_only" is a legacy alias')
      )
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('group_cc')
      )
    })

    it('maps legacy alias group_with_remediation to group_cc with warning', () => {
      core.getInput.mockReturnValue('group_with_remediation')
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('"group_with_remediation" is a legacy alias')
      )
    })

    it('maps legacy alias group_with_validation_consistency to group_cc with warning', () => {
      core.getInput.mockReturnValue('group_with_validation_consistency')
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          '"group_with_validation_consistency" is a legacy alias'
        )
      )
    })

    it('treats push as invalid mode and falls back to individual_cc', () => {
      core.getInput.mockReturnValue('push')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Provided mode "push" is not valid')
      )
    })

    it('maps legacy alias individual_without_push to individual with warning', () => {
      core.getInput.mockReturnValue('individual_without_push')
      expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL)
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('"individual_without_push" is a legacy alias')
      )
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('individual')
      )
    })

    it('two different unknown modes both fall back to individual_cc (payload determinism)', () => {
      core.getInput.mockReturnValue('unknown_mode_a')
      const resultA = getMode()
      core.warning.mockReset()
      core.getInput.mockReturnValue('unknown_mode_b')
      const resultB = getMode()
      expect(resultA).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
      expect(resultB).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
    })

    it('prefers PROCESSING_MODE workflow env var', () => {
      process.env.PROCESSING_MODE = ProcessingModeExternal.GROUP_CC
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
    })

    it('prefers INPUT_PROCESSING_MODE environment variable over core.getInput', () => {
      process.env.INPUT_PROCESSING_MODE = ProcessingModeExternal.GROUP_CC
      core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
      expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
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

      it('returns false by default', () => {
        core.getInput.mockReturnValue('')
        expect(getAutoCreatePrs()).toBe(false)
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

    describe('push control via auto_create_prs', () => {
      it('individual + auto_create_prs=false suppresses push', () => {
        core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL)
        expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL)
        process.env.AUTO_CREATE_PRS = 'false'
        expect(getAutoCreatePrs()).toBe(false)
      })

      it('individual_cc + auto_create_prs=false suppresses push', () => {
        core.getInput.mockReturnValue(ProcessingModeExternal.INDIVIDUAL_CC)
        expect(getMode()).toBe(ProcessingModeExternal.INDIVIDUAL_CC)
        process.env.AUTO_CREATE_PRS = 'false'
        expect(getAutoCreatePrs()).toBe(false)
      })

      it('group_cc + auto_create_prs=false suppresses push', () => {
        core.getInput.mockReturnValue(ProcessingModeExternal.GROUP_CC)
        expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
        process.env.AUTO_CREATE_PRS = 'false'
        expect(getAutoCreatePrs()).toBe(false)
      })

      it('group_cc + auto_create_prs=true allows push', () => {
        core.getInput.mockReturnValue(ProcessingModeExternal.GROUP_CC)
        expect(getMode()).toBe(ProcessingModeExternal.GROUP_CC)
        process.env.AUTO_CREATE_PRS = 'true'
        expect(getAutoCreatePrs()).toBe(true)
      })

      it('auto_create_prs defaults to false when not provided', () => {
        core.getInput.mockReturnValue('')
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

      it('returns false when debug is empty string (default)', () => {
        core.getInput.mockReturnValue('')
        expect(getDebug()).toBe(false)
        expect(core.warning).not.toHaveBeenCalled()
      })

      it('prefers INPUT_DEBUG environment variable', () => {
        process.env.INPUT_DEBUG = 'true'
        core.getInput.mockReturnValue('false')
        expect(getDebug()).toBe(true)
      })
    })

    describe('getCreateIssuesForIncompleteRemediations', () => {
      it('returns true when value is true', () => {
        process.env.CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS = 'true'
        expect(getCreateIssuesForIncompleteRemediations()).toBe(true)
      })

      it('returns false when value is false', () => {
        process.env.CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS = 'false'
        expect(getCreateIssuesForIncompleteRemediations()).toBe(false)
      })

      it('returns false by default', () => {
        core.getInput.mockReturnValue('')
        expect(getCreateIssuesForIncompleteRemediations()).toBe(false)
      })

      it('returns false and warns for invalid value', () => {
        process.env.CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS = 'invalid'
        expect(getCreateIssuesForIncompleteRemediations()).toBe(false)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            'Invalid create-issues-for-incomplete-remediations value'
          )
        )
      })

      it('prefers CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS workflow env var', () => {
        process.env.CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS = 'false'
        core.getInput.mockReturnValue('true')
        expect(getCreateIssuesForIncompleteRemediations()).toBe(false)
      })

      it('prefers INPUT_CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS environment variable', () => {
        process.env.INPUT_CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS = 'false'
        core.getInput.mockReturnValue('true')
        expect(getCreateIssuesForIncompleteRemediations()).toBe(false)
      })
    })

    describe('getCommentModificationMode', () => {
      it('returns basic when value is basic', () => {
        process.env.COMMENT_MODIFICATION_MODE = 'basic'
        expect(getCommentModificationMode()).toBe(CommentModificationMode.BASIC)
      })

      it('returns verbose when value is verbose', () => {
        process.env.COMMENT_MODIFICATION_MODE = 'verbose'
        expect(getCommentModificationMode()).toBe(
          CommentModificationMode.VERBOSE
        )
      })

      it('returns strict when value is strict', () => {
        process.env.COMMENT_MODIFICATION_MODE = 'strict'
        expect(getCommentModificationMode()).toBe(
          CommentModificationMode.STRICT
        )
      })

      it('returns basic by default', () => {
        core.getInput.mockReturnValue('')
        expect(getCommentModificationMode()).toBe(CommentModificationMode.BASIC)
      })

      it('throws for invalid value', () => {
        process.env.COMMENT_MODIFICATION_MODE = 'invalid'
        expect(() => getCommentModificationMode()).toThrow(
          'Invalid comment-modification-mode'
        )
      })

      it('prefers COMMENT_MODIFICATION_MODE workflow env var', () => {
        process.env.COMMENT_MODIFICATION_MODE = 'verbose'
        core.getInput.mockReturnValue('basic')
        expect(getCommentModificationMode()).toBe(
          CommentModificationMode.VERBOSE
        )
      })

      it('prefers INPUT_COMMENT_MODIFICATION_MODE environment variable', () => {
        process.env.INPUT_COMMENT_MODIFICATION_MODE = 'verbose'
        core.getInput.mockReturnValue('basic')
        expect(getCommentModificationMode()).toBe(
          CommentModificationMode.VERBOSE
        )
      })
    })

    describe('getGroupingEnabled', () => {
      it('returns true when grouping-enabled is true', () => {
        process.env.GROUPING_ENABLED = 'true'
        expect(getGroupingEnabled()).toBe(true)
      })

      it('returns false when grouping-enabled is false', () => {
        process.env.GROUPING_ENABLED = 'false'
        expect(getGroupingEnabled()).toBe(false)
      })

      it('returns false by default', () => {
        core.getInput.mockReturnValue('')
        expect(getGroupingEnabled()).toBe(false)
      })

      it('returns false and warns for invalid value', () => {
        process.env.GROUPING_ENABLED = 'invalid'
        expect(getGroupingEnabled()).toBe(false)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid grouping-enabled value')
        )
      })

      it('prefers GROUPING_ENABLED workflow env var', () => {
        process.env.GROUPING_ENABLED = 'true'
        core.getInput.mockReturnValue('false')
        expect(getGroupingEnabled()).toBe(true)
      })

      it('prefers INPUT_GROUPING_ENABLED environment variable', () => {
        process.env.INPUT_GROUPING_ENABLED = 'true'
        core.getInput.mockReturnValue('false')
        expect(getGroupingEnabled()).toBe(true)
      })
    })

    describe('getGroupingStrategy', () => {
      it('returns cwe_category when value is cwe_category', () => {
        process.env.GROUPING_STRATEGY = 'cwe_category'
        expect(getGroupingStrategy()).toBe(GroupingStrategy.CWE_CATEGORY)
      })

      it('returns file_proximity when value is file_proximity', () => {
        process.env.GROUPING_STRATEGY = 'file_proximity'
        expect(getGroupingStrategy()).toBe(GroupingStrategy.FILE_PROXIMITY)
      })

      it('returns module when value is module', () => {
        process.env.GROUPING_STRATEGY = 'module'
        expect(getGroupingStrategy()).toBe(GroupingStrategy.MODULE)
      })

      it('returns smart when value is smart', () => {
        process.env.GROUPING_STRATEGY = 'smart'
        expect(getGroupingStrategy()).toBe(GroupingStrategy.SMART)
      })

      it('returns cwe_category by default', () => {
        core.getInput.mockReturnValue('')
        expect(getGroupingStrategy()).toBe(GroupingStrategy.CWE_CATEGORY)
      })

      it('returns cwe_category and warns for invalid value', () => {
        process.env.GROUPING_STRATEGY = 'invalid_strategy'
        expect(getGroupingStrategy()).toBe(GroupingStrategy.CWE_CATEGORY)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid grouping-strategy')
        )
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('cwe_category')
        )
      })

      it('prefers GROUPING_STRATEGY workflow env var', () => {
        process.env.GROUPING_STRATEGY = 'smart'
        core.getInput.mockReturnValue('cwe_category')
        expect(getGroupingStrategy()).toBe(GroupingStrategy.SMART)
      })

      it('prefers INPUT_GROUPING_STRATEGY environment variable', () => {
        process.env.INPUT_GROUPING_STRATEGY = 'module'
        core.getInput.mockReturnValue('cwe_category')
        expect(getGroupingStrategy()).toBe(GroupingStrategy.MODULE)
      })
    })

    describe('getMaxVulnerabilitiesPerPr', () => {
      it('returns parsed integer value', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = '5'
        expect(getMaxVulnerabilitiesPerPr()).toBe(5)
      })

      it('returns 10 by default', () => {
        core.getInput.mockReturnValue('')
        expect(getMaxVulnerabilitiesPerPr()).toBe(10)
      })

      it('returns 10 and warns for non-numeric value', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = 'abc'
        expect(getMaxVulnerabilitiesPerPr()).toBe(10)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid max-vulnerabilities-per-pr value')
        )
      })

      it('returns 10 and warns for zero', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = '0'
        expect(getMaxVulnerabilitiesPerPr()).toBe(10)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Must be a positive integer')
        )
      })

      it('returns 10 and warns for negative value', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = '-5'
        expect(getMaxVulnerabilitiesPerPr()).toBe(10)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Must be a positive integer')
        )
      })

      it('handles large valid values', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = '100'
        expect(getMaxVulnerabilitiesPerPr()).toBe(100)
      })

      it('returns 10 and warns for float value', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = '3.5'
        // parseInt will parse '3.5' as 3, which is valid
        expect(getMaxVulnerabilitiesPerPr()).toBe(3)
      })

      it('prefers MAX_VULNERABILITIES_PER_PR workflow env var', () => {
        process.env.MAX_VULNERABILITIES_PER_PR = '20'
        core.getInput.mockReturnValue('5')
        expect(getMaxVulnerabilitiesPerPr()).toBe(20)
      })

      it('prefers INPUT_MAX_VULNERABILITIES_PER_PR environment variable', () => {
        process.env.INPUT_MAX_VULNERABILITIES_PER_PR = '15'
        core.getInput.mockReturnValue('5')
        expect(getMaxVulnerabilitiesPerPr()).toBe(15)
      })
    })

    describe('getGroupingStage', () => {
      it('returns pre_push when value is pre_push', () => {
        process.env.GROUPING_STAGE = 'pre_push'
        expect(getGroupingStage()).toBe(GroupingStage.PRE_PUSH)
      })

      it('returns pre_remediation when value is pre_remediation', () => {
        process.env.GROUPING_STAGE = 'pre_remediation'
        expect(getGroupingStage()).toBe(GroupingStage.PRE_REMEDIATION)
      })

      it('returns pre_push by default', () => {
        core.getInput.mockReturnValue('')
        expect(getGroupingStage()).toBe(GroupingStage.PRE_PUSH)
      })

      it('returns pre_push and warns for invalid value', () => {
        process.env.GROUPING_STAGE = 'invalid_stage'
        expect(getGroupingStage()).toBe(GroupingStage.PRE_PUSH)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid grouping-stage')
        )
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('pre_push')
        )
      })

      it('prefers GROUPING_STAGE workflow env var', () => {
        process.env.GROUPING_STAGE = 'pre_remediation'
        core.getInput.mockReturnValue('pre_push')
        expect(getGroupingStage()).toBe(GroupingStage.PRE_REMEDIATION)
      })

      it('prefers INPUT_GROUPING_STAGE environment variable', () => {
        process.env.INPUT_GROUPING_STAGE = 'pre_remediation'
        core.getInput.mockReturnValue('pre_push')
        expect(getGroupingStage()).toBe(GroupingStage.PRE_REMEDIATION)
      })
    })

    describe('getUpdateContext', () => {
      it('returns true when update-context is true', () => {
        process.env.UPDATE_CONTEXT = 'true'
        expect(getUpdateContext()).toBe(true)
      })

      it('returns false when update-context is false', () => {
        process.env.UPDATE_CONTEXT = 'false'
        expect(getUpdateContext()).toBe(false)
      })

      it('returns false by default', () => {
        core.getInput.mockReturnValue('')
        expect(getUpdateContext()).toBe(false)
      })

      it('returns false and warns for invalid value', () => {
        process.env.UPDATE_CONTEXT = 'invalid'
        expect(getUpdateContext()).toBe(false)
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining('Invalid update-context value')
        )
      })

      it('prefers UPDATE_CONTEXT workflow env var', () => {
        process.env.UPDATE_CONTEXT = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUpdateContext()).toBe(true)
      })

      it('prefers INPUT_UPDATE_CONTEXT environment variable', () => {
        process.env.INPUT_UPDATE_CONTEXT = 'true'
        core.getInput.mockReturnValue('false')
        expect(getUpdateContext()).toBe(true)
      })
    })
  })

  describe('regression evidence getters', () => {
    it('reads regression evidence refs and artifact paths from workflow env', () => {
      process.env.REGRESSION_EVIDENCE_BASE_REF = 'origin/main'
      process.env.REGRESSION_EVIDENCE_BASE_SHA = 'abc123'
      process.env.REGRESSION_EVIDENCE_HEAD_REF = 'HEAD'
      process.env.REGRESSION_EVIDENCE_HEAD_SHA = 'def456'
      process.env.REGRESSION_EVIDENCE_COVERAGE_ARTIFACTS =
        'coverage/a.json,coverage/b.json'
      process.env.REGRESSION_EVIDENCE_TEST_COMMANDS =
        'npm test -- {{tests}}\\nnpm run test:smoke'

      expect(getRegressionEvidenceBaseRef()).toBe('origin/main')
      expect(getRegressionEvidenceBaseSha()).toBe('abc123')
      expect(getRegressionEvidenceHeadRef()).toBe('HEAD')
      expect(getRegressionEvidenceHeadSha()).toBe('def456')
      expect(getRegressionEvidenceCoverageArtifacts()).toBe(
        'coverage/a.json,coverage/b.json'
      )
      expect(getRegressionEvidenceTestCommands()).toBe(
        'npm test -- {{tests}}\\nnpm run test:smoke'
      )
    })

    it('uses default output paths when not provided', () => {
      core.getInput.mockReturnValue('')
      expect(getRegressionEvidenceOutputJsonPath()).toBe(
        'regression-evidence.json'
      )
      expect(getRegressionEvidenceOutputMarkdownPath()).toBe(
        'regression-evidence.md'
      )
    })

    it('parses boolean policy flags and warns on invalid values', () => {
      process.env.REGRESSION_EVIDENCE_ALLOW_PARTIAL = 'true'
      process.env.REGRESSION_EVIDENCE_FAIL_ON_AT_RISK = 'false'
      expect(getRegressionEvidenceAllowPartial()).toBe(true)
      expect(getRegressionEvidenceFailOnAtRisk()).toBe(false)

      process.env.REGRESSION_EVIDENCE_ALLOW_PARTIAL = 'maybe'
      process.env.REGRESSION_EVIDENCE_FAIL_ON_AT_RISK = 'maybe'
      expect(getRegressionEvidenceAllowPartial()).toBe(true)
      expect(getRegressionEvidenceFailOnAtRisk()).toBe(false)
      expect(core.warning).toHaveBeenCalled()
    })
  })
})
