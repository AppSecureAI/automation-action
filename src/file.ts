// src/file.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import fs from 'fs'
import * as core from '@actions/core'
import path from 'path'
import { FileReadError } from './errors.js'
import { LogLabels } from './constants.js'

export interface SastInputFile {
  path: string
  buffer: Buffer
}

/**
 * Check if a file path has a valid name for supported security tools
 * @param filePath - The file path to validate
 * @returns boolean - True if file has valid name, false otherwise
 */
export function validFileName(filePath: string): boolean {
  if (!(filePath && filePath.trim().length > 0)) {
    return false
  }

  // Extract just the filename from the path
  const fileName = path.basename(filePath)

  // Regex pattern to validate filename and extension
  const validFilePattern = new RegExp(
    '^(?!.*\\.\\.)[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*\\.(json|sarif|csv|tsv)$',
    'i'
  )
  return validFilePattern.test(fileName)
}

/**
 * Validate a file path string and its extension
 * @param filePath - The file path to validate
 * @returns boolean - True if file path is valid and has supported extension, false otherwise
 */
export function validFilePath(filePath: string): boolean {
  return validFileName(filePath)
}

/**
 * Check if a file exists at the given path with input validation
 * @param filePath - The path to check
 * @returns Promise<boolean> - True if file exists, false otherwise
 */
export function fileExists(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Validate input first
    if (!validFilePath(filePath)) {
      resolve(false)
      return
    }

    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
      resolve(!err)
    })
  })
}

/**
 * Read a file asynchronously with proper error handling and input validation
 * @param fileName - The path to the file to read
 * @param successCallback - Callback function called with file data on success
 * @param failureCallback - Callback function called with error on failure
 */
export function asyncReadFile(
  fileName: string,
  successCallback: (data: Buffer) => void,
  failureCallback: (err: NodeJS.ErrnoException) => void
): void {
  // Validate input first
  if (!validFilePath(fileName)) {
    const error = new FileReadError(
      'Invalid file path: path cannot be empty, contain only whitespace, or have unsupported file extension. Supported formats: .json, .sarif, .csv, .tsv',
      'EINVAL',
      fileName
    )
    failureCallback(error)
    return
  }

  // First check if file exists
  fileExists(fileName)
    .then((exists) => {
      if (!exists) {
        const error = new FileReadError(
          `File not found: ${fileName}`,
          'ENOENT',
          fileName
        )
        failureCallback(error)
        return
      }

      core.debug(`Vulnerabilities File: ${fileName}`)

      core.info(`[${LogLabels.FILE_READ}] Reading file...`)

      // File exists, proceed with reading
      fs.readFile(fileName, (err, data) => {
        if (err) {
          failureCallback(err)
        } else if (data) {
          successCallback(data)
        } else {
          const error = new FileReadError(
            `No data read from file: ${fileName}`,
            'ENODATA',
            fileName
          )
          failureCallback(error)
        }
      })
    })
    .catch((err) => {
      failureCallback(err as NodeJS.ErrnoException)
    })
}

export async function readFile(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    asyncReadFile(
      filePath,
      (data) => resolve(data),
      (err) => reject(err)
    )
  })
}

function splitFileInput(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.split(path.sep).join('/')
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
  return new RegExp(`^${regex}$`)
}

function expandFilePattern(pattern: string): string[] {
  if (!pattern.includes('*')) {
    return [pattern]
  }

  const matcher = globToRegExp(pattern)
  const entries = fs.readdirSync(process.cwd(), { recursive: true }) as string[]
  return entries
    .filter((entryPath) =>
      fs.statSync(path.join(process.cwd(), entryPath)).isFile()
    )
    .map((entryPath) => entryPath.split(path.sep).join('/'))
    .filter((entryPath) => matcher.test(entryPath))
    .sort()
}

export function resolveInputFilePaths(file: string, files: string): string[] {
  if (file.trim() && files.trim()) {
    throw new FileReadError(
      'Provide either file or files, not both',
      'EINVAL',
      file
    )
  }

  const candidates = files.trim() ? splitFileInput(files) : splitFileInput(file)
  if (candidates.length === 0) {
    throw new FileReadError(
      'No vulnerability result files were provided',
      'EINVAL',
      file || files
    )
  }

  const resolved = candidates.flatMap(expandFilePattern)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const filePath of resolved) {
    const key = path.resolve(filePath)
    if (seen.has(key)) {
      duplicates.add(filePath)
    }
    seen.add(key)
  }

  if (duplicates.size > 0) {
    throw new FileReadError(
      `Duplicate vulnerability result file paths: ${Array.from(duplicates).join(', ')}`,
      'EINVAL',
      Array.from(duplicates)[0]
    )
  }

  return resolved
}

export async function readInputFiles(
  filePaths: string[]
): Promise<SastInputFile[]> {
  const readFiles = await Promise.all(
    filePaths.map(async (filePath) => ({
      path: filePath,
      buffer: await readFile(filePath)
    }))
  )
  return readFiles
}
