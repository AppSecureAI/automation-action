// src/input.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import {
  ProcessingModeExternal,
  TriageMethod,
  RemediateMethod,
  ValidateMethod
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
  const value = getInputValue('debug', 'INPUT_DEBUG')
  if (value !== 'true' && value !== 'false') {
    core.warning(
      `Invalid debug value "${value}". Must be "true" or "false". Using default: false`
    )
    return false
  }
  return value === 'true'
}
