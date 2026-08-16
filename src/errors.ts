// src/errors.ts

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
