import * as core from '@actions/core'
import axios from 'axios'
import {
  RunResponseSchema,
  ResponseStatusSchema,
  StepListSchema
} from './schemas.js'
import { getIdToken } from './github.js'
import {
  getApiUrl,
  getMode,
  getUseTriageCc,
  getTriageMethod,
  getUseRemediateCc,
  getRemediateMethod,
  getUseValidateCc,
  getValidateMethod,
  getUseRemediateLoopCc
} from './input.js'
import { SubmitRunOutput } from './types.js'
import store from './store.js'
import { logSteps } from './utils.js'
import { LogLabels } from './constants.js'

const API_TIMEOUT = 8 * 60 * 1000

export async function submitRun(
  file: Buffer,
  fileName: string
): Promise<SubmitRunOutput> {
  const apiUrl = getApiUrl()
  const token = await getIdToken(apiUrl)
  const url = `${apiUrl}/api-product/submit`
  const mode = getMode()

  core.info(`Processing mode: ${mode}`)
  core.info(
    `Claude Code solvers - Triage: ${getUseTriageCc()}, Remediate: ${getUseRemediateCc()}, Validate: ${getUseValidateCc()}, Loop: ${getUseRemediateLoopCc()}`
  )

  const formData = new FormData()
  formData.append('file', new Blob([file]), fileName)
  formData.append('processing_mode', mode)

  // Add Claude Code solver variant parameters
  formData.append('use_triage_cc', String(getUseTriageCc()))
  formData.append('triage_method', getTriageMethod())
  formData.append('use_remediate_cc', String(getUseRemediateCc()))
  formData.append('remediate_method', getRemediateMethod())
  formData.append('use_validate_cc', String(getUseValidateCc()))
  formData.append('validate_method', getValidateMethod())
  formData.append('use_remediate_loop_cc', String(getUseRemediateLoopCc()))

  core.debug('Calling submit API: POST /api-product/submit')

  const setup = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    timeout: API_TIMEOUT
  }
  const prefixLabel = `[${LogLabels.RUN_SUBMIT}]`
  core.info(`${prefixLabel} Submitting analysis results for processing...`)

  return axios
    .post(url, formData, setup)
    .then((response) => {
      const parsedResponse = RunResponseSchema.safeParse(response.data)

      if (!parsedResponse.success) {
        const errorMessage = `${prefixLabel} Call failed: Received an unexpected response format from the server. Please contact support if this issue persists.`
        core.error(errorMessage)
        throw new Error(errorMessage)
      }

      const validData = parsedResponse.data

      core.info(`${prefixLabel} call succeeded`)
      core.info('======= process =======')

      logSteps(validData.steps, LogLabels.RUN_SUBMIT)

      return {
        message: validData.message,
        run_id: validData.run_id
      } as SubmitRunOutput
    })
    .catch((error) => {
      let errorMessage = `${prefixLabel} Call failed: An unexpected error occurred. Please check your configuration and try again.`

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = `${prefixLabel} Call failed: Request timed out. Please check your network connection and try again.`
        } else if (error.response?.data) {
          const apiDetail = error.response.data.detail
          errorMessage = apiDetail?.description ?? errorMessage

          if (apiDetail?.steps) {
            const stepList = StepListSchema.safeParse(apiDetail.steps)
            if (stepList.success) {
              logSteps(stepList.data, LogLabels.RUN_SUBMIT)
            } else {
              // Removed technical error details
            }
          }
        } else {
          errorMessage = `${prefixLabel} Call failed: ${error.message}`
        }
      } else {
        core.debug(`Original error: ${error.toString()}`)
      }

      core.error(errorMessage)
      throw new Error(errorMessage)
    })
}

export async function getStatus(id: string) {
  const apiUrl = getApiUrl()
  const token = await getIdToken(apiUrl)
  const url = `${apiUrl}/api-product/submit/status/${id}`
  const prefixLabel = `[${LogLabels.RUN_STATUS}]`

  core.debug(`Calling status API: GET /api-product/submit/status/${id}`)

  const setup = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    timeout: 8000
  }

  return axios
    .get(url, setup)
    .then((response) => {
      const parsedResponse = ResponseStatusSchema.safeParse(response.data)

      if (!parsedResponse.success) {
        const errorMessage = `${prefixLabel} failed: Received an unexpected response format from the server. Please contact support if this issue persists.`
        core.error(errorMessage)
        throw new Error(errorMessage)
      }

      const results = parsedResponse.data.results
      let totalVulns = 0

      if (results) {
        if (results.find && typeof results.find.count === 'number') {
          totalVulns = results.find.count
        }

        for (const [key, value] of Object.entries(results)) {
          if (
            !store.finalLogPrinted[key] &&
            typeof value === 'object' &&
            value !== null
          ) {
            if (key === 'find' && Array.isArray(value.extras?.cwe_list)) {
              core.info(
                `${prefixLabel}: CWE found: ${value.extras.cwe_list.join(', ')}`
              )
            }

            if (key === 'triage') {
              if (value.extras?.true_positives) {
                core.info(
                  `${prefixLabel}: True positives found: ${value.extras.true_positives}`
                )
              }
              if (value.extras?.false_positives) {
                core.info(
                  `${prefixLabel}: False positives found: ${value.extras.false_positives}`
                )
              }
            }

            if (typeof value.count === 'number') {
              core.info(
                `${prefixLabel}: ${key} ..... processed ${value.count} vulnerabilities`
              )
              if (value.count === totalVulns) {
                core.info(
                  `${prefixLabel}: ${key} solver has processed all vulnerabilities!`
                )
                store.finalLogPrinted[key] = true
              }
            }
          }
        }
      } else {
        core.debug(`${prefixLabel}: No results found (.......)`)
        core.info('.......')
      }
      core.info('======= ***** =======')

      return { status: 'progress' }
    })
    .catch((error) => {
      if (
        error.message &&
        error.message.includes('unexpected response format')
      ) {
        throw error
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status) {
          core.warning(
            `${prefixLabel} Call failed with status code: ${status}. The server may be temporarily unavailable.`
          )
        } else if (error.code === 'ECONNABORTED') {
          core.warning(
            `${prefixLabel} Call failed: Request timed out. Please check your network connection.`
          )
        } else {
          core.warning(`${prefixLabel} Call failed: ${error.message}`)
        }
      } else {
        core.warning(
          `${prefixLabel}: An unexpected error occurred. Please try again.`
        )
        core.debug(`Original error: ${error.toString()}`)
      }

      return { status: 'failed', error: 'Status check failed' }
    })
}

export async function pollStatusUntilComplete(
  getStatusFunc: () => Promise<{ status: string; [key: string]: any }>,
  maxRetries = 15,
  delay = 3000
): Promise<any | null> {
  for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
    core.debug(`Status check attempt ${retryCount + 1}/${maxRetries}`)
    try {
      const statusData = await getStatusFunc()

      core.debug(`Status response data: ${JSON.stringify(statusData)}`)
      if (statusData.status === 'completed') {
        return statusData
      } else if (statusData.status === 'failed') {
        core.error(
          `Processing failed: ${statusData.error}. Please review the logs for more details.`
        )
        return null
      }
    } catch (error: any) {
      core.warning(`Status check attempt failed. Retrying...`)
      core.debug(`Original status error: ${error.message || error}`)
    }

    core.info(`Still processing, waiting ${delay / 1000} seconds...`)
    await new Promise((res) => setTimeout(res, delay))
  }

  core.warning(
    `Processing timed out after ${maxRetries} attempts. The analysis may still be running on the server.`
  )
  return null
}
