// __fixtures__/service.ts

import { jest } from '@jest/globals'

export const submitRun = jest.fn<typeof import('../src/service.js').submitRun>()
export const cancelRun = jest.fn<typeof import('../src/service.js').cancelRun>()
export const getStatus = jest.fn<typeof import('../src/service.js').getStatus>()
export const pollStatusUntilComplete =
  jest.fn<typeof import('../src/service.js').pollStatusUntilComplete>()
export const finalizeRun =
  jest.fn<typeof import('../src/service.js').finalizeRun>()
export const delay = jest.fn<typeof import('../src/service.js').delay>()
