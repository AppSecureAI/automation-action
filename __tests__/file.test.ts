// __tests__/file.test.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

/**
 * Unit tests for src/file.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { jest } from '@jest/globals'
import {
  validFileName,
  validFilePath,
  fileExists,
  asyncReadFile,
  readFile
} from '../src/file.js'

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('file.ts', () => {
  const testDir = path.join(__dirname, 'test-files')
  const existingFile = path.join(testDir, 'existing.json')
  const nonExistentFile = path.join(testDir, 'non-existent.json')
  const emptyFile = path.join(testDir, 'empty.json')
  const largeFile = path.join(testDir, 'large.json')

  // Setup and teardown
  beforeAll(async () => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    // Create test files
    fs.writeFileSync(existingFile, JSON.stringify({ test: 'data', number: 42 }))
    fs.writeFileSync(emptyFile, '')
    fs.writeFileSync(
      largeFile,
      JSON.stringify({
        large: 'data'.repeat(1000),
        array: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          value: `item-${i}`
        }))
      })
    )
  })

  afterAll(async () => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('hasValidFileExtension', () => {
    it('returns true for .json files', () => {
      expect(validFileName('file.json')).toBe(true)
      expect(validFileName('path/to/file.json')).toBe(true)
      expect(validFileName('bandit_results.json')).toBe(true)
      expect(validFileName('semgrep_output.json')).toBe(true)
      expect(validFileName('FILE.JSON')).toBe(true) // Case insensitive
      expect(validFileName('File.Json')).toBe(true) // Mixed case
    }, 12000)

    it('returns true for .sarif files', () => {
      expect(validFileName('file.sarif')).toBe(true)
      expect(validFileName('path/to/file.sarif')).toBe(true)
      expect(validFileName('codeql_results.sarif')).toBe(true)
      expect(validFileName('FILE.SARIF')).toBe(true) // Case insensitive
      expect(validFileName('File.Sarif')).toBe(true) // Mixed case
    }, 12000)

    it('returns false for unsupported file extensions', () => {
      expect(validFileName('file.txt')).toBe(false)
      expect(validFileName('file.xml')).toBe(false)
      expect(validFileName('file.yaml')).toBe(false)
      expect(validFileName('file.yml')).toBe(false)
      expect(validFileName('file.csv')).toBe(false)
      expect(validFileName('file.pdf')).toBe(false)
      expect(validFileName('file.docx')).toBe(false)
      expect(validFileName('file.html')).toBe(false)
      expect(validFileName('file.css')).toBe(false)
      expect(validFileName('file.js')).toBe(false)
      expect(validFileName('file.ts')).toBe(false)
      expect(validFileName('file.py')).toBe(false)
      expect(validFileName('file.java')).toBe(false)
    }, 12000)

    it('returns false for files without extensions', () => {
      expect(validFileName('file')).toBe(false)
      expect(validFileName('path/to/file')).toBe(false)
      expect(validFileName('bandit_results')).toBe(false)
      expect(validFileName('codeql_results')).toBe(false)
    }, 12000)

    it('returns false for files with only dots', () => {
      expect(validFileName('file.')).toBe(false)
      expect(validFileName('.file')).toBe(false)
      expect(validFileName('.')).toBe(false)
      expect(validFileName('..')).toBe(false)
    }, 12000)

    it('returns false for invalid inputs', () => {
      expect(validFileName('')).toBe(false)
      expect(validFileName('   ')).toBe(false)
      expect(validFileName(null as any)).toBe(false)
      expect(validFileName(undefined as any)).toBe(false)
    }, 12000)

    it('handles edge cases with multiple dots', () => {
      expect(validFileName('file.backup.json')).toBe(true)
      expect(validFileName('file.backup.sarif')).toBe(true)
      expect(validFileName('file..json')).toBe(false)
      expect(validFileName('file..sarif')).toBe(false)
      expect(validFileName('file...json')).toBe(false)
      expect(validFileName('file...sarif')).toBe(false)
    }, 12000)

    describe('validates filename characters properly', () => {
      test('accepts valid filename characters', () => {
        // Valid characters: letters, numbers, underscores, hyphens, single dots
        expect(validFileName('file.json')).toBe(true)
        expect(validFileName('file123.json')).toBe(true)
        expect(validFileName('file_name.json')).toBe(true)
        expect(validFileName('file-name.json')).toBe(true)
        expect(validFileName('file.backup.json')).toBe(true)
        expect(validFileName('file.backup.2023.json')).toBe(true)
      }, 7000)

      it('rejects some safe but invalid filename characters', () => {
        expect(validFileName('file@name.json')).toBe(false)
        expect(validFileName('file^name.json')).toBe(false)
        expect(validFileName('file~name.json')).toBe(false)
        expect(validFileName('file!name.json')).toBe(false)
        expect(validFileName('file,name.json')).toBe(false)
      })

      it('rejects invalid filename characters', () => {
        expect(validFileName('file#name.json')).toBe(false)
        expect(validFileName('file$name.json')).toBe(false)
        expect(validFileName('file%name.json')).toBe(false)
        expect(validFileName('file&name.json')).toBe(false)
        expect(validFileName('file*name.json')).toBe(false)
        expect(validFileName('file(name.json')).toBe(false)
        expect(validFileName('file)name.json')).toBe(false)
        expect(validFileName('file+name.json')).toBe(false)
        expect(validFileName('file=name.json')).toBe(false)
        expect(validFileName('file[name.json')).toBe(false)
        expect(validFileName('file]name.json')).toBe(false)
        expect(validFileName('file{name.json')).toBe(false)
        expect(validFileName('file}name.json')).toBe(false)
        expect(validFileName('file|name.json')).toBe(false)
        expect(validFileName('file\\name.json')).toBe(false)
        expect(validFileName('file:name.json')).toBe(false)
        expect(validFileName('file;name.json')).toBe(false)
        expect(validFileName('file"name.json')).toBe(false)
        expect(validFileName("file'name.json")).toBe(false)
        expect(validFileName('file<name.json')).toBe(false)
        expect(validFileName('file>name.json')).toBe(false)
        expect(validFileName('file?name.json')).toBe(false)
        expect(validFileName('file`name.json')).toBe(false)
      }, 12000)
    })

    it('prevents consecutive dots in filename', () => {
      expect(validFileName('file..json')).toBe(false)
      expect(validFileName('file...json')).toBe(false)
      expect(validFileName('file....json')).toBe(false)
      expect(validFileName('file.backup..json')).toBe(false)
      expect(validFileName('file..backup.json')).toBe(false)
      expect(validFileName('..file.json')).toBe(false)
      expect(validFileName('file..')).toBe(false)
      expect(validFileName('..json')).toBe(false)
    }, 12000)
  })

  describe('validFilePath', () => {
    it('returns true for valid file paths with supported extensions', () => {
      expect(validFilePath('file.json')).toBe(true)
      expect(validFilePath('path/to/file.json')).toBe(true)
      expect(validFilePath('file.sarif')).toBe(true)
      expect(validFilePath('path/to/file.sarif')).toBe(true)
    })

    it('returns false for invalid file paths', () => {
      expect(validFilePath('')).toBe(false)
      expect(validFilePath('   ')).toBe(false)
      expect(validFilePath('  file.json  ')).toBe(false) // Trims whitespace
      expect(validFilePath('  file.sarif  ')).toBe(false) // Trims whitespace
      expect(validFilePath('file.txt')).toBe(false)
      expect(validFilePath('file.xml')).toBe(false)
      expect(validFilePath('file')).toBe(false)
      expect(validFilePath('file.')).toBe(false)
      expect(validFilePath(null as any)).toBe(false)
      expect(validFilePath(undefined as any)).toBe(false)
    })

    it('returns false when filename is valid but extension is not supported', () => {
      expect(validFilePath('valid_filename.txt')).toBe(false)
      expect(validFilePath('valid_filename.xml')).toBe(false)
      expect(validFilePath('valid_filename.yaml')).toBe(false)
    })

    it('returns false when extension is valid but filename is invalid', () => {
      expect(validFilePath('')).toBe(false)
      expect(validFilePath('   ')).toBe(false)
      expect(validFilePath(null as any)).toBe(false)
      expect(validFilePath(undefined as any)).toBe(false)
    })
  })

  describe('fileExists', () => {
    it('returns true for existing files', async () => {
      const exists = await fileExists(existingFile)
      expect(exists).toBe(true)
    })

    it('returns false for non-existent files', async () => {
      const exists = await fileExists(nonExistentFile)
      expect(exists).toBe(false)
    })

    it('returns true for empty files', async () => {
      const exists = await fileExists(emptyFile)
      expect(exists).toBe(true)
    })

    it('returns false for invalid paths', async () => {
      const exists = await fileExists('')
      expect(exists).toBe(false)
    })

    it('returns false for whitespace-only paths', async () => {
      const exists = await fileExists('   ')
      expect(exists).toBe(false)
    })
  })

  describe('asyncReadFile - Failure Scenarios', () => {
    it('calls failure callback when file does not exist', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn()
        const failureCallback = jest.fn((err: NodeJS.ErrnoException) => {
          expect(err.message).toContain('File not found')
          expect(err.code).toBe('ENOENT')
          expect(successCallback).not.toHaveBeenCalled()
          resolve()
        })

        asyncReadFile(nonExistentFile, successCallback, failureCallback)
      })
    })

    it('calls failure callback when file path is empty', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn()
        const failureCallback = jest.fn((err: NodeJS.ErrnoException) => {
          expect(err.message).toContain('Invalid file path')
          expect(err.code).toBe('EINVAL')
          expect(successCallback).not.toHaveBeenCalled()
          resolve()
        })

        asyncReadFile('', successCallback, failureCallback)
      })
    })

    it('calls failure callback when file path contains only whitespace', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn()
        const failureCallback = jest.fn((err: NodeJS.ErrnoException) => {
          expect(err.message).toContain('Invalid file path')
          expect(err.code).toBe('EINVAL')
          expect(successCallback).not.toHaveBeenCalled()
          resolve()
        })

        asyncReadFile('   ', successCallback, failureCallback)
      })
    })

    it('calls failure callback when file path is invalid', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn()
        const failureCallback = jest.fn((err: NodeJS.ErrnoException) => {
          expect(err.message).toContain('File not found')
          expect(err.code).toBe('ENOENT')
          expect(successCallback).not.toHaveBeenCalled()
          resolve()
        })

        asyncReadFile(
          '/invalid/path/that/does/not/exist/file.json',
          successCallback,
          failureCallback
        )
      })
    })

    it('calls failure callback when file exists but cannot be read due to permissions', () => {
      return new Promise<void>((resolve) => {
        // Create a file with restricted permissions
        const restrictedFile = path.join(testDir, 'restricted.json')
        fs.writeFileSync(restrictedFile, 'test data')
        fs.chmodSync(restrictedFile, 0o000) // No permissions

        const successCallback = jest.fn()
        const failureCallback = jest.fn((err: NodeJS.ErrnoException) => {
          expect(err.code).toBe('EACCES')
          expect(successCallback).not.toHaveBeenCalled()

          // Clean up
          fs.chmodSync(restrictedFile, 0o644)
          fs.unlinkSync(restrictedFile)
          resolve()
        })

        asyncReadFile(restrictedFile, successCallback, failureCallback)
      })
    })
  })

  describe('asyncReadFile - Success Scenarios', () => {
    it('calls success callback with file data for existing file', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn((data: Buffer) => {
          const content = JSON.parse(data.toString())
          expect(content).toEqual({ test: 'data', number: 42 })
          expect(failureCallback).not.toHaveBeenCalled()
          resolve()
        })
        const failureCallback = jest.fn()

        asyncReadFile(existingFile, successCallback, failureCallback)
      })
    }, 20000)

    it('calls success callback with empty buffer for empty file', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn((data: Buffer) => {
          expect(data.toString()).toBe('')
          expect(failureCallback).not.toHaveBeenCalled()
          resolve()
        })
        const failureCallback = jest.fn()

        asyncReadFile(emptyFile, successCallback, failureCallback)
      })
    }, 20000)

    it('calls success callback with large file data', () => {
      return new Promise<void>((resolve) => {
        const successCallback = jest.fn((data: Buffer) => {
          const content = JSON.parse(data.toString())
          expect(content.large).toBeDefined()
          expect(content.array).toHaveLength(100)
          expect(content.array[0]).toEqual({ id: 0, value: 'item-0' })
          expect(failureCallback).not.toHaveBeenCalled()
          resolve()
        })
        const failureCallback = jest.fn()

        asyncReadFile(largeFile, successCallback, failureCallback)
      })
    }, 20000)
  })

  describe('asyncReadFile - Edge Cases', () => {
    it('does not handle files with unicode characters', () => {
      return new Promise<void>((resolve) => {
        const unicodeFile = path.join(testDir, 'file-中文-émojis-🚀.json')
        const testData = { unicode: '测试', emoji: '🚀', mixed: 'test-中文-🚀' }
        fs.writeFileSync(unicodeFile, JSON.stringify(testData))

        const successCallback = jest.fn()
        const failureCallback = jest.fn(() => {
          expect(failureCallback).toHaveBeenCalled()

          // Clean up
          fs.unlinkSync(unicodeFile)
          resolve()
        })

        asyncReadFile(unicodeFile, successCallback, failureCallback)
      })
    }, 20000)
  })

  describe('readFile', () => {
    const testDir = path.join(__dirname, 'test-files')
    const validFile = path.join(testDir, 'valid.json')
    const emptyFile = path.join(testDir, 'empty.json')
    const missingFile = path.join(testDir, 'missing.json')

    beforeAll(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir)
      }
      fs.writeFileSync(validFile, JSON.stringify({ hello: 'world' }))
      fs.writeFileSync(emptyFile, '')
    })

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('resolves with file contents for a valid file', async () => {
      const data = await readFile(validFile)
      expect(JSON.parse(data.toString())).toEqual({ hello: 'world' })
    })

    it('resolves with empty buffer for empty file', async () => {
      const data = await readFile(emptyFile)
      expect(data).toBeInstanceOf(Buffer)
      expect(data.toString()).toBe('')
    })

    it('rejects with EINVAL for invalid path', async () => {
      await expect(readFile('')).rejects.toMatchObject({ code: 'EINVAL' })
      await expect(readFile('invalid.txt')).rejects.toMatchObject({
        code: 'EINVAL'
      })
    })

    it('rejects with ENOENT for missing file', async () => {
      await expect(readFile(missingFile)).rejects.toMatchObject({
        code: 'ENOENT'
      })
    })

    it('rejects when fs.readFile fails', async () => {
      const spy = jest.spyOn(fs, 'readFile').mockImplementation((_p, cb) => {
        cb(new Error('Mock read error') as NodeJS.ErrnoException, null as any)
      })

      await expect(readFile(validFile)).rejects.toThrow('Mock read error')

      spy.mockRestore()
    })
  })
})
