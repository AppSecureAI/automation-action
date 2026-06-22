import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import axios from '../__fixtures__/axios'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('axios', () => ({ default: axios }))

const { AppSecAIRuntime, buildSubmitFormData } =
  await import('../src/common/core/index.js')

describe('common core runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    axios.isAxiosError.mockImplementation(
      (payload): payload is never =>
        !!payload && typeof payload === 'object' && 'isAxiosError' in payload
    )
  })

  it('builds canonical submit payload defaults', () => {
    const formData = buildSubmitFormData(
      [{ path: 'results.sarif', buffer: Buffer.from('{}') }],
      {
        processingMode: 'individual_cc',
        autoCreatePrs: false,
        createIssuesForIncompleteRemediations: false,
        commentModificationMode: 'basic'
      }
    )

    expect(formData.get('processing_mode')).toBe('individual_cc')
    expect(formData.get('auto_create_prs')).toBe('false')
    expect(formData.get('create_issues_for_incomplete_remediations')).toBe(
      'false'
    )
    expect(formData.get('comment_modification_mode')).toBe('basic')
    expect(formData.get('experiment')).toBeNull()
    expect(formData.get('update_context')).toBeNull()
    expect(formData.get('grouping_enabled')).toBeNull()
  })

  it('uses repeated files fields for multi-file submissions', () => {
    const formData = buildSubmitFormData(
      [
        { path: 'semgrep.sarif', buffer: Buffer.from('{}') },
        { path: 'codeql.sarif', buffer: Buffer.from('{}') }
      ],
      {
        processingMode: 'group_cc',
        autoCreatePrs: true,
        createIssuesForIncompleteRemediations: true,
        commentModificationMode: 'verbose',
        groupingStrategy: 'smart',
        groupingStage: 'pre_remediation',
        experiment: true,
        maxVulnerabilitiesPerPr: 25
      }
    )

    expect(formData.get('file')).toBeNull()
    expect(formData.getAll('files')).toHaveLength(2)
    expect(formData.get('processing_mode')).toBe('group_cc')
    expect(formData.get('auto_create_prs')).toBe('true')
    expect(formData.get('grouping_strategy')).toBe('smart')
    expect(formData.get('grouping_stage')).toBe('pre_remediation')
    expect(formData.get('experiment')).toBe('true')
    expect(formData.get('max_vulnerabilities_per_pr')).toBe('25')
  })

  it('submits through the configured transport with auth and timeout', async () => {
    axios.post.mockResolvedValue({ data: { ok: true } })
    const runtime = new AppSecAIRuntime({
      apiUrl: 'https://api.appsecai.example',
      getAuthToken: async () => 'token-123'
    })

    await runtime.submitRun(
      [{ path: 'results.sarif', buffer: Buffer.from('{}') }],
      {
        processingMode: 'individual_cc',
        autoCreatePrs: false,
        createIssuesForIncompleteRemediations: false,
        commentModificationMode: 'basic'
      }
    )

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.appsecai.example/api-product/submit',
      expect.any(FormData),
      {
        headers: { Authorization: 'Bearer token-123' },
        timeout: 480000
      }
    )
  })

  it('routes status and finalize requests through runtime endpoints', async () => {
    axios.get.mockResolvedValue({ data: { ok: true } })
    axios.post.mockResolvedValue({ data: { ok: true } })
    const runtime = new AppSecAIRuntime({
      apiUrl: 'https://api.appsecai.example',
      getAuthToken: async () => undefined
    })

    await runtime.getStatus('run-1', { organizationId: 'org-1' })
    await runtime.finalizeRun('run-1', { organizationId: 'org-1' })

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.appsecai.example/api-product/organizations/org-1/runs/run-1/status',
      { headers: undefined, timeout: 15000 }
    )
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.appsecai.example/api-product/organizations/org-1/runs/run-1/compute-summary',
      {},
      { headers: undefined, timeout: 30000 }
    )
  })
})
