// src/errors.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

export class SubmitRunError extends Error {
  public readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'SubmitRunError'
    this.cause = cause
  }
}

export class FileReadError extends Error {
  public readonly code: string
  public readonly path?: string
  public readonly cause?: unknown

  constructor(message: string, code: string, path?: string, cause?: unknown) {
    super(message)
    this.name = 'FileReadError'
    this.code = code
    this.path = path
    this.cause = cause
  }
}
