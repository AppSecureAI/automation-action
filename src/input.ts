// src/input.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import {
  ProcessingModeExternal,
  TriageMethod,
  RemediateMethod,
  ValidateMethod,
  CommentModificationMode,
  GroupingStrategy,
  GroupingStage
} from './types.js'

/**
 * Gets an input value from environment variables or action inputs.
 *
 * Priority order:
 * 1. Workflow-level env var (e.g., PROCESSING_MODE) - for clean workflow config
 * 2. INPUT_ prefixed env var (e.g., INPUT_PROCESSING_MODE) - for composite action
 * 3. core.getInput() - for action inputs
 */
function getInputValue(
  name: string,
  envName?: string,
  workflowEnvName?: string
): string {
  // First try workflow-level env var (cleanest for users)
  if (workflowEnvName) {
    const workflowValue = process.env[workflowEnvName]
    if (workflowValue !== undefined && workflowValue !== '') {
      return workflowValue
    }
  }
  // Then try INPUT_ prefixed env var (for composite action compatibility)
  if (envName) {
    const envValue = process.env[envName]
    if (envValue !== undefined && envValue !== '') {
      return envValue
    }
  }
  // Fall back to core.getInput (for action inputs)
  return core.getInput(name)
}

export function getApiUrl() {
  return getInputValue('api-url', 'INPUT_API_URL')
}

export function getFile() {
  return getInputValue('file', 'INPUT_FILE')
}

export function getToken() {
  return getInputValue('token', 'INPUT_TOKEN')
}

export function getMode() {
  const mode =
    getInputValue(
      'processing-mode',
      'INPUT_PROCESSING_MODE',
      'PROCESSING_MODE'
    ) || ProcessingModeExternal.INDIVIDUAL

  if (!(Object.values(ProcessingModeExternal) as string[]).includes(mode)) {
    const allowedModes = Object.values(ProcessingModeExternal).join(', ')

    core.warning(
      `Warning: Provided mode "${mode}" is not valid. Using default mode "${ProcessingModeExternal.INDIVIDUAL}".`
    )
    core.warning(`Allowed modes are: ${allowedModes}`)
    return ProcessingModeExternal.INDIVIDUAL
  }

  return mode as ProcessingModeExternal
}

export function getUseTriageCc(): boolean {
  const value =
    getInputValue('use-triage-cc', 'INPUT_USE_TRIAGE_CC', 'USE_TRIAGE_CC') ||
    'true'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid use-triage-cc value "${value}". Must be "true" or "false". Using default: true`
    )
    return true
  }
  return value === 'true'
}

export function getTriageMethod(): TriageMethod {
  const method =
    getInputValue('triage-method', 'INPUT_TRIAGE_METHOD', 'TRIAGE_METHOD') ||
    TriageMethod.ML_BASED
  if (!(Object.values(TriageMethod) as string[]).includes(method)) {
    const allowedMethods = Object.values(TriageMethod).join(', ')
    core.warning(
      `Invalid triage-method "${method}". Allowed values: ${allowedMethods}. Using default: ml_based`
    )
    return TriageMethod.ML_BASED
  }
  return method as TriageMethod
}

export function getUseRemediateCc(): boolean {
  const value =
    getInputValue(
      'use-remediate-cc',
      'INPUT_USE_REMEDIATE_CC',
      'USE_REMEDIATE_CC'
    ) || 'false'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid use-remediate-cc value "${value}". Must be "true" or "false". Using default: false`
    )
    return false
  }
  return value === 'true'
}

export function getRemediateMethod(): RemediateMethod {
  const method =
    getInputValue(
      'remediate-method',
      'INPUT_REMEDIATE_METHOD',
      'REMEDIATE_METHOD'
    ) || RemediateMethod.ADVANCED
  if (!(Object.values(RemediateMethod) as string[]).includes(method)) {
    const allowedMethods = Object.values(RemediateMethod).join(', ')
    core.warning(
      `Invalid remediate-method "${method}". Allowed values: ${allowedMethods}. Using default: advanced`
    )
    return RemediateMethod.ADVANCED
  }
  return method as RemediateMethod
}

export function getUseValidateCc(): boolean {
  const value =
    getInputValue(
      'use-validate-cc',
      'INPUT_USE_VALIDATE_CC',
      'USE_VALIDATE_CC'
    ) || 'false'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid use-validate-cc value "${value}". Must be "true" or "false". Using default: false`
    )
    return false
  }
  return value === 'true'
}

export function getValidateMethod(): ValidateMethod {
  const method =
    getInputValue(
      'validate-method',
      'INPUT_VALIDATE_METHOD',
      'VALIDATE_METHOD'
    ) || ValidateMethod.BASELINE
  if (!(Object.values(ValidateMethod) as string[]).includes(method)) {
    const allowedMethods = Object.values(ValidateMethod).join(', ')
    core.warning(
      `Invalid validate-method "${method}". Allowed values: ${allowedMethods}. Using default: baseline`
    )
    return ValidateMethod.BASELINE
  }
  return method as ValidateMethod
}

export function getUseRemediateLoopCc(): boolean {
  const value =
    getInputValue(
      'use-remediate-loop-cc',
      'INPUT_USE_REMEDIATE_LOOP_CC',
      'USE_REMEDIATE_LOOP_CC'
    ) || 'true'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid use-remediate-loop-cc value "${value}". Must be "true" or "false". Using default: true`
    )
    return true
  }
  return value === 'true'
}

export function getAutoCreatePrs(): boolean {
  const value =
    getInputValue(
      'auto-create-prs',
      'INPUT_AUTO_CREATE_PRS',
      'AUTO_CREATE_PRS'
    ) || 'true'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid auto-create-prs value "${value}". Must be "true" or "false". Using default: true`
    )
    return true
  }
  return value === 'true'
}

export function getDebug(): boolean {
  const value = getInputValue('debug', 'INPUT_DEBUG') || 'false'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid debug value "${value}". Must be "true" or "false". Using default: false`
    )
    return false
  }
  return value === 'true'
}

export function getCreateIssuesForIncompleteRemediations(): boolean {
  const value =
    getInputValue(
      'create-issues-for-incomplete-remediations',
      'INPUT_CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS',
      'CREATE_ISSUES_FOR_INCOMPLETE_REMEDIATIONS'
    ) || 'true'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid create-issues-for-incomplete-remediations value "${value}". Must be "true" or "false". Using default: true`
    )
    return true
  }
  return value === 'true'
}

export function getCommentModificationMode(): CommentModificationMode {
  const mode =
    getInputValue(
      'comment-modification-mode',
      'INPUT_COMMENT_MODIFICATION_MODE',
      'COMMENT_MODIFICATION_MODE'
    ) || CommentModificationMode.BASIC
  if (!(Object.values(CommentModificationMode) as string[]).includes(mode)) {
    const allowedModes = Object.values(CommentModificationMode).join(', ')
    core.warning(
      `Invalid comment-modification-mode "${mode}". Allowed values: ${allowedModes}. Using default: basic`
    )
    return CommentModificationMode.BASIC
  }
  return mode as CommentModificationMode
}

export function getGroupingEnabled(): boolean {
  const value =
    getInputValue(
      'grouping-enabled',
      'INPUT_GROUPING_ENABLED',
      'GROUPING_ENABLED'
    ) || 'false'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid grouping-enabled value "${value}". Must be "true" or "false". Using default: false`
    )
    return false
  }
  return value === 'true'
}

export function getGroupingStrategy(): GroupingStrategy {
  const strategy =
    getInputValue(
      'grouping-strategy',
      'INPUT_GROUPING_STRATEGY',
      'GROUPING_STRATEGY'
    ) || GroupingStrategy.CWE_CATEGORY
  if (!(Object.values(GroupingStrategy) as string[]).includes(strategy)) {
    const allowedStrategies = Object.values(GroupingStrategy).join(', ')
    core.warning(
      `Invalid grouping-strategy "${strategy}". Allowed values: ${allowedStrategies}. Using default: cwe_category`
    )
    return GroupingStrategy.CWE_CATEGORY
  }
  return strategy as GroupingStrategy
}

export function getMaxVulnerabilitiesPerPr(): number {
  const value =
    getInputValue(
      'max-vulnerabilities-per-pr',
      'INPUT_MAX_VULNERABILITIES_PER_PR',
      'MAX_VULNERABILITIES_PER_PR'
    ) || '10'
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1) {
    core.warning(
      `Invalid max-vulnerabilities-per-pr value "${value}". Must be a positive integer. Using default: 10`
    )
    return 10
  }
  return parsed
}

export function getGroupingStage(): GroupingStage {
  const stage =
    getInputValue('grouping-stage', 'INPUT_GROUPING_STAGE', 'GROUPING_STAGE') ||
    GroupingStage.PRE_PUSH
  if (!(Object.values(GroupingStage) as string[]).includes(stage)) {
    const allowedStages = Object.values(GroupingStage).join(', ')
    core.warning(
      `Invalid grouping-stage "${stage}". Allowed values: ${allowedStages}. Using default: pre_push`
    )
    return GroupingStage.PRE_PUSH
  }
  return stage as GroupingStage
}

export function getUpdateContext(): boolean {
  const value =
    getInputValue('update-context', 'INPUT_UPDATE_CONTEXT', 'UPDATE_CONTEXT') ||
    'false'
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid update-context value "${value}". Must be "true" or "false". Using default: false`
    )
    return false
  }
  return value === 'true'
}
