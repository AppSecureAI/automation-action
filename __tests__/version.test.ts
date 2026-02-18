import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from '@jest/globals'

import {
  VERSION,
  CLIENT_VERSION,
  MIN_SERVER_API_VERSION,
  VERSION_INFO
} from '../src/version.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

describe('version.ts', () => {
  it('exports expected version symbols', () => {
    expect(VERSION).toBeDefined()
    expect(CLIENT_VERSION).toBeDefined()
    expect(MIN_SERVER_API_VERSION).toBeDefined()
    expect(VERSION_INFO).toBeDefined()
  })

  it('keeps aliases and minimum API version stable', () => {
    expect(CLIENT_VERSION).toBe(VERSION)
    expect(MIN_SERVER_API_VERSION).toBe('v1')
  })

  it('matches package.json version and package name', () => {
    const packageJsonPath = path.join(ROOT_DIR, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

    expect(VERSION).toBe(packageJson.version)
    expect(VERSION_INFO.version).toBe(packageJson.version)
    expect(VERSION_INFO.name).toBe(packageJson.name)
  })
})
