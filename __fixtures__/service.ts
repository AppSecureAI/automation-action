// __fixtures__/service.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { jest } from '@jest/globals'

export const submitRun = jest.fn<typeof import('../src/service.js').submitRun>()
export const getStatus = jest.fn<typeof import('../src/service.js').getStatus>()
export const pollStatusUntilComplete =
  jest.fn<typeof import('../src/service.js').pollStatusUntilComplete>()
export const finalizeRun =
  jest.fn<typeof import('../src/service.js').finalizeRun>()
