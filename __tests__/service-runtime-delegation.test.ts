import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import github from '../__fixtures__/github.js'
import axios from '../__fixtures__/axios'
import {
  logSteps,
  logProcessTracking,
  logSummary
} from '../__fixtures__/utils.js'

const mockCreateAppSecAIRuntime = jest.fn()
const mockRuntimeSubmitRun =
  jest.fn<(files: unknown, payload: unknown) => Promise<unknown>>()
const mockRuntimeGetStatus =
  jest.fn<(runId: string, options: unknown) => Promise<unknown>>()
const mockRuntimeFinalizeRun =
  jest.fn<(runId: string, options: unknown) => Promise<unknown>>()
const mockGetApiUrl = jest.fn()
const mockGetMode = jest.fn()
const mockGetAutoCreatePrs = jest.fn()
const mockGetCreateIssuesForIncompleteRemediations = jest.fn()
const mockGetCommentModificationMode = jest.fn()
const mockGetMaxVulnerabilitiesPerPr = jest.fn()
const mockIsMaxVulnerabilitiesPerPrConfigured = jest.fn()
const mockGetGroupingEnabled = jest.fn()
const mockGetGroupingStrategy = jest.fn()
const mockIsGroupingStrategyConfigured = jest.fn()
const mockGetGroupingStage = jest.fn()
const mockIsGroupingStageConfigured = jest.fn()
const mockGetUpdateContext = jest.fn()
const mockGetLlmProfile = jest.fn()
const mockGetPrAudience = jest.fn()
const mockGetAllowMissingRepoAccess = jest.fn()

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('axios', () => ({ default: axios }))
jest.unstable_mockModule('../src/store.js', () => ({
  default: { finalLogPrinted: {} }
}))
jest.unstable_mockModule('../src/utils.js', () => ({
  logSteps,
  logProcessTracking,
  logSummary
}))
jest.unstable_mockModule('../src/input.js', () => ({
  getApiUrl: mockGetApiUrl,
  getMode: mockGetMode,
  getAutoCreatePrs: mockGetAutoCreatePrs,
  getCreateIssuesForIncompleteRemediations:
    mockGetCreateIssuesForIncompleteRemediations,
  getCommentModificationMode: mockGetCommentModificationMode,
  getMaxVulnerabilitiesPerPr: mockGetMaxVulnerabilitiesPerPr,
  isMaxVulnerabilitiesPerPrConfigured: mockIsMaxVulnerabilitiesPerPrConfigured,
  getGroupingEnabled: mockGetGroupingEnabled,
  getGroupingStrategy: mockGetGroupingStrategy,
  isGroupingStrategyConfigured: mockIsGroupingStrategyConfigured,
  getGroupingStage: mockGetGroupingStage,
  isGroupingStageConfigured: mockIsGroupingStageConfigured,
  getUpdateContext: mockGetUpdateContext,
  getLlmProfile: mockGetLlmProfile,
  getPrAudience: mockGetPrAudience,
  getAllowMissingRepoAccess: mockGetAllowMissingRepoAccess
}))
jest.unstable_mockModule('../src/common/core/index.js', () => ({
  createAppSecAIRuntime: mockCreateAppSecAIRuntime,
  fetchWithRetry: jest.fn()
}))

const { getIdToken } = await import('../src/github.js')
const { submitRun, getStatus, finalizeRun } = await import('../src/service.js')

describe('service runtime delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateAppSecAIRuntime.mockReturnValue({
      submitRun: mockRuntimeSubmitRun,
      getStatus: mockRuntimeGetStatus,
      finalizeRun: mockRuntimeFinalizeRun
    })
    mockGetApiUrl.mockReturnValue('https://some-url')
    mockGetMode.mockReturnValue('individual_cc')
    mockGetAutoCreatePrs.mockReturnValue(false)
    mockGetCreateIssuesForIncompleteRemediations.mockReturnValue(false)
    mockGetCommentModificationMode.mockReturnValue('basic')
    mockGetMaxVulnerabilitiesPerPr.mockReturnValue(10)
    mockIsMaxVulnerabilitiesPerPrConfigured.mockReturnValue(false)
    mockGetGroupingEnabled.mockReturnValue(false)
    mockGetGroupingStrategy.mockReturnValue('cwe_category')
    mockIsGroupingStrategyConfigured.mockReturnValue(false)
    mockGetGroupingStage.mockReturnValue('pre_push')
    mockIsGroupingStageConfigured.mockReturnValue(false)
    mockGetUpdateContext.mockReturnValue(false)
    mockGetLlmProfile.mockReturnValue(undefined)
    mockGetPrAudience.mockReturnValue('')
    mockGetAllowMissingRepoAccess.mockReturnValue(false)
  })

  it('delegates submit transport through the common runtime with action-adapted payload', async () => {
    mockRuntimeSubmitRun.mockResolvedValue({
      data: {
        message: 'submitted',
        run_id: 'run-1',
        organization_id: 'org-1',
        steps: []
      }
    })

    const result = await submitRun(Buffer.from('{}'), 'results.sarif')

    expect(mockCreateAppSecAIRuntime).toHaveBeenCalledWith({
      apiUrl: 'https://some-url',
      getAuthToken: getIdToken
    })
    expect(mockRuntimeSubmitRun).toHaveBeenCalledWith(
      [{ path: 'results.sarif', buffer: Buffer.from('{}') }],
      {
        processingMode: 'individual_cc',
        autoCreatePrs: false,
        createIssuesForIncompleteRemediations: false,
        commentModificationMode: 'basic',
        llmProfile: undefined,
        maxVulnerabilitiesPerPr: undefined,
        groupingStrategy: undefined,
        groupingStage: undefined,
        prAudience: undefined,
        allowMissingRepoAccess: false
      }
    )
    expect(result).toEqual({
      message: 'submitted',
      run_id: 'run-1',
      organization_id: 'org-1'
    })
  })

  it('delegates status transport through the common runtime', async () => {
    mockRuntimeGetStatus.mockResolvedValue({
      data: {
        message: 'Processing',
        results: null,
        run_status: 'completed',
        process_tracking: null,
        summary: null
      }
    })

    const result = await getStatus('run-1', 'org-1')

    expect(mockRuntimeGetStatus).toHaveBeenCalledWith('run-1', {
      organizationId: 'org-1'
    })
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed'
      })
    )
  })

  it('delegates finalize transport through the common runtime', async () => {
    mockRuntimeFinalizeRun.mockResolvedValue({
      data: {
        pr_count: 0,
        pr_urls: [],
        issue_urls: []
      }
    })

    const result = await finalizeRun('run-1', {
      organizationId: 'org-1',
      maxRetries: 1
    })

    expect(mockRuntimeFinalizeRun).toHaveBeenCalledWith('run-1', {
      organizationId: 'org-1'
    })
    expect(result).toEqual(
      expect.objectContaining({
        pr_count: 0,
        pr_urls: [],
        issue_urls: []
      })
    )
  })
})
