// src/common/core/index.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'

const API_TIMEOUT = 8 * 60 * 1000
const STATUS_TIMEOUT = 15 * 1000
const FINALIZE_TIMEOUT = 30 * 1000
const SUBMIT_RETRY_MAX_RETRIES = 4
const SUBMIT_RETRY_BASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 10 : 2000

export interface RuntimeInputFile {
  path: string
  buffer: Buffer
}

export interface SubmitPayloadOptions {
  processingMode: string
  autoCreatePrs: boolean
  createIssuesForIncompleteRemediations: boolean
  commentModificationMode: string
  llmProfile?: string
  maxVulnerabilitiesPerPr?: number
  groupingStrategy?: string
  groupingStage?: string
}

export interface StatusRequestOptions {
  organizationId?: string
}

export interface FinalizeRequestOptions {
  organizationId?: string
}

export interface RuntimeAuthProvider {
  (apiUrl: string): Promise<string | undefined>
}

export interface RuntimeTransport {
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>>
  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>>
}

export interface AppSecAIRuntimeConfig {
  apiUrl: string
  getAuthToken: RuntimeAuthProvider
  transport?: RuntimeTransport
}

function isRetriableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  if (!error.response) return true
  return error.response.status >= 500
}

export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries || !isRetriableError(error)) {
        throw error
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt)
      core.debug(
        `Retriable error on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delayMs}ms...`
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw new Error('fetchWithRetry: unreachable')
}

export function buildSubmitFormData(
  inputFiles: RuntimeInputFile[],
  payload: SubmitPayloadOptions
): FormData {
  const formData = new FormData()

  if (inputFiles.length === 1) {
    formData.append(
      'file',
      new Blob([inputFiles[0].buffer]),
      inputFiles[0].path
    )
  } else {
    for (const inputFile of inputFiles) {
      formData.append('files', new Blob([inputFile.buffer]), inputFile.path)
    }
  }

  formData.append('processing_mode', payload.processingMode)
  if (payload.llmProfile !== undefined) {
    formData.append('llm_profile', payload.llmProfile)
  }
  formData.append('auto_create_prs', String(payload.autoCreatePrs))
  formData.append(
    'create_issues_for_incomplete_remediations',
    String(payload.createIssuesForIncompleteRemediations)
  )
  formData.append('comment_modification_mode', payload.commentModificationMode)

  if (payload.maxVulnerabilitiesPerPr !== undefined) {
    formData.append(
      'max_vulnerabilities_per_pr',
      String(payload.maxVulnerabilitiesPerPr)
    )
  }

  if (payload.groupingStrategy !== undefined) {
    formData.append('grouping_strategy', payload.groupingStrategy)
  }

  if (payload.groupingStage !== undefined) {
    formData.append('grouping_stage', payload.groupingStage)
  }

  return formData
}

export class AppSecAIRuntime {
  private readonly apiUrl: string
  private readonly getAuthToken: RuntimeAuthProvider
  private readonly transport: RuntimeTransport

  constructor(config: AppSecAIRuntimeConfig) {
    this.apiUrl = config.apiUrl
    this.getAuthToken = config.getAuthToken
    this.transport = config.transport ?? axios
  }

  async submitRun(
    inputFiles: RuntimeInputFile[],
    payload: SubmitPayloadOptions
  ): Promise<AxiosResponse<unknown>> {
    const formData = buildSubmitFormData(inputFiles, payload)
    const url = `${this.apiUrl}/api-product/submit`

    return fetchWithRetry(
      async () =>
        this.transport.post(
          url,
          formData,
          await this.buildRequestConfig(API_TIMEOUT)
        ),
      SUBMIT_RETRY_MAX_RETRIES,
      SUBMIT_RETRY_BASE_DELAY_MS
    )
  }

  async getStatus(
    runId: string,
    options: StatusRequestOptions = {}
  ): Promise<AxiosResponse<unknown>> {
    const url = options.organizationId
      ? new URL(
          `${this.apiUrl}/api-product/organizations/${options.organizationId}/runs/${runId}/status`
        )
      : new URL(`${this.apiUrl}/api-product/submit/status/${runId}`)

    return fetchWithRetry(
      async () =>
        this.transport.get(
          url.toString(),
          await this.buildRequestConfig(STATUS_TIMEOUT)
        ),
      2,
      500
    )
  }

  async finalizeRun(
    runId: string,
    options: FinalizeRequestOptions = {}
  ): Promise<AxiosResponse<unknown>> {
    const url = options.organizationId
      ? new URL(
          `${this.apiUrl}/api-product/organizations/${options.organizationId}/runs/${runId}/compute-summary`
        )
      : new URL(`${this.apiUrl}/api-product/runs/${runId}/compute-summary`)

    return this.transport.post(
      url.toString(),
      {},
      await this.buildRequestConfig(FINALIZE_TIMEOUT)
    )
  }

  private async buildRequestConfig(
    timeout: number
  ): Promise<AxiosRequestConfig> {
    const token = await this.getAuthToken(this.apiUrl)

    return {
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined,
      timeout
    }
  }
}

export function createAppSecAIRuntime(
  config: AppSecAIRuntimeConfig
): AppSecAIRuntime {
  return new AppSecAIRuntime(config)
}
