// __fixtures__/file.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { jest } from '@jest/globals'

export const asyncReadFile = jest.fn<
  typeof import('../src/file.js').asyncReadFile
>((f, sc, _fc) => {
  const jsonData = JSON.stringify({ key: f })
  const inputBuffer = Buffer.from(jsonData)
  sc(inputBuffer)
})

export const fileExists = jest.fn<typeof import('../src/file.js').fileExists>(
  (filePath: string) => {
    return new Promise((resolve) => {
      resolve(!!filePath)
    })
  }
)

export const readFile = jest.fn<typeof import('../src/file.js').readFile>(
  (filePath: string) => {
    const jsonData = JSON.stringify({ key: filePath })
    const inputBuffer = Buffer.from(jsonData)
    return Promise.resolve(inputBuffer)
  }
)
