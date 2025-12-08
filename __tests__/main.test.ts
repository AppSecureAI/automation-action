/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'
import { fileExists, readFile } from '../__fixtures__/file'
import {
  submitRun,
  getStatus,
  pollStatusUntilComplete
} from '../__fixtures__/service'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/file', () => ({
  fileExists,
  readFile
}))
jest.unstable_mockModule('../src/service', () => ({
  submitRun,
  getStatus,
  pollStatusUntilComplete
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main')

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation(() => 'some_file.json')
    readFile.mockImplementation((filePath: string) => {
      const jsonData = JSON.stringify({ key: filePath })
      const inputBuffer = Buffer.from(jsonData)
      return Promise.resolve(inputBuffer)
    })
    submitRun.mockImplementation(() =>
      Promise.resolve({
        message: 'This was the received file: some_file.json',
        run_id: 'run-12345'
      })
    )
    getStatus.mockImplementation(() => Promise.resolve({ status: 'completed' }))
    pollStatusUntilComplete.mockImplementation(() =>
      Promise.resolve({ status: 'completed' })
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('success cases', () => {
    it('should set the message output when processing completes successfully', async () => {
      await run()

      // Verify the message output was set.
      expect(core.setOutput).toHaveBeenNthCalledWith(
        1,
        'message',
        expect.stringMatching(/Processing completed successfully/)
      )
    })

    it('should process file and call submitRun with correct data', async () => {
      await run()

      expect(submitRun).toHaveBeenCalledWith(
        expect.any(Buffer),
        'some_file.json'
      )
    })

    it('should call pollStatusUntilComplete when run_id is provided', async () => {
      await run()

      expect(pollStatusUntilComplete).toHaveBeenCalledWith(
        expect.any(Function),
        50,
        10000
      )
    })
  })

  describe('file reading failures', () => {
    it('should handle general file read error and call core.error with appropriate message', async () => {
      const error = new Error('File not found')
      readFile.mockClear().mockImplementationOnce(() => Promise.reject(error))

      await run()

      expect(core.error).toHaveBeenCalledWith('File not found')
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle ENOENT error and call core.error with file not found message', async () => {
      const error = new Error('File not found')
      // @ts-ignore
      error.code = 'ENOENT'
      readFile.mockClear().mockImplementationOnce(() => Promise.reject(error))

      await run()

      expect(core.error).toHaveBeenCalledWith(
        'File not found: some_file.json. Please check if the file path is correct and the file exists. Aborting process.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle ENODATA error and call core.error with file empty message', async () => {
      const error = new Error('File is empty')
      // @ts-ignore
      error.code = 'ENODATA'
      readFile.mockClear().mockImplementationOnce(() => Promise.reject(error))

      await run()

      expect(core.error).toHaveBeenCalledWith(
        'File is empty or could not be read: some_file.json. Please check if the file contains data. Aborting process.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })
  })

  describe('service failures', () => {
    it('should handle string error from submitRun and call core.error', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject('Reject!')
      })

      await run()

      expect(core.error).toHaveBeenNthCalledWith(
        1,
        'Failed to submit analysis results for processing. Please check your network connection and API configuration.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle Error instance from submitRun and call core.error with error message', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Error instance!'))
      })

      await run()

      expect(core.error).toHaveBeenCalledTimes(1)

      // Check that the mock calls include the two expected messages
      expect(core.error).toHaveBeenCalledWith(
        'Failed to submit analysis results for processing. Please check your network connection and API configuration.'
      )
    })

    it('should handle unknown error from submitRun and call core.error with "Unknown Error"', async () => {
      submitRun.mockClear().mockImplementationOnce(() => {
        return Promise.reject(2)
      })

      await run()

      expect(core.error).toHaveBeenNthCalledWith(
        1,
        'Failed to submit analysis results for processing. Please check your network connection and API configuration.'
      )
      expect(core.setFailed).toHaveBeenCalledWith(expect.any(String))
    })

    it('should handle submitRun without run_id and not call pollStatusUntilComplete', async () => {
      submitRun.mockClear().mockImplementationOnce(() =>
        Promise.resolve({
          message: 'Success but no run_id',
          run_id: null
        })
      )

      await run()

      expect(pollStatusUntilComplete).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith(
        'message',
        'Processing completed successfully.'
      )
    })
  })

  describe('status polling failures', () => {
    it('should handle pollStatusUntilComplete failure and call core.warning', async () => {
      pollStatusUntilComplete.mockClear().mockImplementationOnce(() => {
        return Promise.reject(new Error('Polling failed'))
      })
      await run()

      expect(core.warning).toHaveBeenCalledWith(
        '[Analysis Processing Status] Failed to poll status for run_id: run-12345. The analysis may still be running on the server.'
      )
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })
})
