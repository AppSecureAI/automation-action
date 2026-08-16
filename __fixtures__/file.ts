// __fixtures__/file.ts

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

export const resolveInputFilePaths = jest.fn<
  typeof import('../src/file.js').resolveInputFilePaths
>((file: string, files: string) => {
  return (files || file)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
})

export const readInputFiles = jest.fn<
  typeof import('../src/file.js').readInputFiles
>(async (filePaths: string[]) =>
  Promise.all(
    filePaths.map(async (filePath) => ({
      path: filePath,
      buffer: await readFile(filePath)
    }))
  )
)
