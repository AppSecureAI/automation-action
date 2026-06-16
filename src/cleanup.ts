// src/cleanup.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import { cancelRun } from './service.js'

export async function runCleanup(): Promise<void> {
  const runId = core.getState('runId')
  const organizationId = core.getState('organizationId')
  const apiUrl = core.getState('apiUrl')

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
    await cancelRun(runId, organizationId, apiUrl)
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
