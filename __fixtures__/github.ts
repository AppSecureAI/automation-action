// __fixtures__/github.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { jest } from '@jest/globals'

const github = jest.fn(() => ({
  __esModule: true,
  context: {
    repo: {
      owner: 'onwer',
      repo: 'repo'
    },
    payload: {},
    eventName: '',
    sha: '',
    ref: '',
    workflow: '',
    action: 'test-action',
    actor: 'test-user',
    job: '',
    runNumber: 0,
    runId: 0,
    apiUrl: '',
    serverUrl: '',
    graphqlUrl: '',
    issue: {
      owner: '',
      repo: '',
      number: 0
    }
  }
}))

export default github
