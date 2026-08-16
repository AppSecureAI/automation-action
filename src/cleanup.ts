// src/cleanup.ts

import * as core from '@actions/core'
import { cancelRun } from './service.js'

export async function runCleanup(): Promise<void> {
  const runId = core.getState('runId')
  const organizationId = core.getState('organizationId')
  const apiUrl = core.getState('apiUrl')
  const authToken = core.getState('cancelAuthToken')

  if (!runId) {
    core.info(
      'No submitted AppSecAI run ID found; skipping cleanup cancellation.'
    )
    return
  }

  if (!organizationId) {
    core.warning(
      `Submitted AppSecAI run ${runId} has no organization ID; skipping cleanup cancellation.`
    )
    return
  }

  try {
    await cancelRun(runId, organizationId, apiUrl, authToken || undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to request cancellation for AppSecAI run ${runId}: ${message}`
    )
  }
}

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  runCleanup()
}
