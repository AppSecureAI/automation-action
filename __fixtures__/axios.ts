// __fixtures__/axios.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import type { AxiosError, AxiosInstance } from 'axios'
import { jest } from '@jest/globals'

const axiosMock = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(() => axiosMock),
  isAxiosError: jest.fn((payload): payload is AxiosError => {
    // This is a simple implementation. A real mock might check for more properties.
    return !!payload && typeof payload === 'object' && 'isAxiosError' in payload
  })
} as unknown as jest.Mocked<AxiosInstance & AxiosInstance> & {
  reset: () => void
  isAxiosError: jest.Mock<(payload: unknown) => payload is AxiosError>
}

axiosMock.reset = () => {
  axiosMock.get.mockReset()
  axiosMock.post.mockReset()
  axiosMock.put.mockReset()
  axiosMock.delete.mockReset()
  axiosMock.create.mockReset()
  axiosMock.isAxiosError.mockReset()
}

export default axiosMock
