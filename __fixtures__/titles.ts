import { jest } from '@jest/globals'

export const fetchPrTitles =
  jest.fn<typeof import('../src/titles.js').fetchPrTitles>()
export const parsePrUrl =
  jest.fn<typeof import('../src/titles.js').parsePrUrl>()
