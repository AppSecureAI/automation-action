// __tests__/cleanup.test.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.

import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'
import { cancelRun } from '../__fixtures__/service'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/service', () => ({
  cancelRun
}))

const { runCleanup } = await import('../src/cleanup')

describe('cleanup.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('no-ops when the main action never saved a run ID', async () => {
    core.getState.mockReturnValue('')

    await runCleanup()

    expect(cancelRun).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'No submitted AppSecAI run ID found; skipping cleanup cancellation.'
    )
  })

  it('no-ops when the submitted run has no organization ID', async () => {
    core.getState.mockImplementation((name: string) => {
      if (name === 'runId') return 'run-123'
      return ''
    })

    await runCleanup()

    expect(cancelRun).not.toHaveBeenCalled()
    expect(core.warning).toHaveBeenCalledWith(
      'Submitted AppSecAI run run-123 has no organization ID; skipping cleanup cancellation.'
    )
  })

  it('requests cancellation with saved run state', async () => {
    core.getState.mockImplementation((name: string) => {
      if (name === 'runId') return 'run-123'
      if (name === 'organizationId') return 'org-456'
      if (name === 'apiUrl') return 'https://gh.intg.appsecai.net'
      return ''
    })

    await runCleanup()

    expect(cancelRun).toHaveBeenCalledWith(
      'run-123',
      'org-456',
      'https://gh.intg.appsecai.net'
    )
  })

  it('warns without failing when cancellation cannot be requested', async () => {
    core.getState.mockImplementation((name: string) => {
      if (name === 'runId') return 'run-123'
      if (name === 'organizationId') return 'org-456'
      if (name === 'apiUrl') return 'https://gh.intg.appsecai.net'
      return ''
    })
    cancelRun.mockRejectedValueOnce(new Error('network down'))

    await runCleanup()

    expect(core.warning).toHaveBeenCalledWith(
      'Failed to request cancellation for AppSecAI run run-123: network down'
    )
  })
})
