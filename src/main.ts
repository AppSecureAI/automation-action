import * as core from '@actions/core'
import { readFile } from './file.js'
import { getStatus, pollStatusUntilComplete, submitRun } from './service.js'
import store from './store.js'
import { SubmitRunError } from './errors.js'
import { SubmitRunOutput } from './types.js'
import { LogLabels } from './constants.js'

export async function run(): Promise<void> {
  const file: string = core.getInput('file')

  // Polling configuration for status checks
  // timeout: Maximum wait time (10 seconds) between status check attempts
  // intervalCheck: Display progress messages every 10 seconds during submission
  // retries: Maximum number of polling attempts (50 retries × 10s = ~8 minutes total)
  const timeout = 10000
  const intervalCheck = 10000
  const retries = 50

  let fileBuffer: Buffer
  let submitOutput: SubmitRunOutput

  try {
    core.info(
      '======== Getting static analysis results for further processing. ========'
    )

    // Step 1: Read the file
    try {
      fileBuffer = await readFile(file)
    } catch (error) {
      core.debug(`Error reading file: ${error}.`)
      // Re-throw to be caught by the outer block and handled as a final error
      throw error
    }

    // Step 2: Submit the run
    const intervalId = setInterval(() => {
      core.info(`[${LogLabels.RUN_SUBMIT}] submit in progress...`)
    }, intervalCheck)

    try {
      submitOutput = await submitRun(fileBuffer, file)
      core.info(submitOutput.message)
    } catch (error) {
      core.debug(`Error submit run ${error}`)
      // Re-throw to be caught by the outer block
      throw new SubmitRunError(
        `Failed to submit analysis results for processing. Please check your network connection and API configuration.`,
        error
      )
    } finally {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }

    // Step 3: Poll for status (non-critical failure)
    if (submitOutput.run_id) {
      store.id = submitOutput.run_id

      core.info(
        `[${LogLabels.RUN_STATUS}] Monitoring analysis status for run ID '${store.id}'. This may take some time.`
      )
      try {
        const getRunStatus = () => getStatus(store.id)
        await pollStatusUntilComplete(getRunStatus, retries, timeout)
      } catch (pollError) {
        // This is a "soft" failure. Log a warning but let the process complete
        core.warning(
          `[${LogLabels.RUN_STATUS}] Failed to poll status for run_id: ${store.id}. The analysis may still be running on the server.`
        )
      }
    }

    core.info(
      '======== Analysis processing complete. Results have been submitted successfully. ========'
    )
    core.setOutput('message', 'Processing completed successfully.')
  } catch (error) {
    // This is the final catch for any critical errors
    let errorMessage =
      'An unexpected error occurred. Please check the logs for details.'

    if (error instanceof Error && 'code' in error) {
      const err = error as NodeJS.ErrnoException
      switch (err.code) {
        case 'ENOENT':
          errorMessage = `File not found: ${file}. Please check if the file path is correct and the file exists.`
          break
        case 'ENODATA':
          errorMessage = `File is empty or could not be read: ${file}. Please check if the file contains data.`
          break
        case 'EINVAL':
          errorMessage = `Invalid file path: path cannot be empty, contain only whitespace, or have unsupported file extension. Supported formats: .json, .sarif`
          break
        default:
          errorMessage = `An error occurred while processing the file: ${file}. Please verify the file is accessible and properly formatted.`
      }

      errorMessage = `${errorMessage} Aborting process.`
    } else if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    core.error(errorMessage)
    core.setFailed(errorMessage)
  }
}
