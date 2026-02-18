// src/version-service.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as semver from 'semver'
import * as core from '@actions/core'
import axios from 'axios'
import { CLIENT_VERSION } from './version.js'

/**
 * Version information from Medusa server
 */
export interface VersionInfo {
  /** Server API version */
  apiVersion: string
  /** Medusa service version */
  serviceVersion: string
  /** Minimum compatible client version */
  minClientVersion: string
  /** Git commit SHA (short) */
  gitSha: string
}

/**
 * Expected structure of the /version endpoint response
 */
interface ServerVersionResponse {
  version?: string
  api?: {
    version?: string
    min_compatible_client?: string
  }
  git?: {
    sha_short?: string
  }
}

/**
 * Check if client version is below minimum required and log warning if so.
 * Uses semver.coerce() for flexible version parsing.
 *
 * @param minClientVersion - Minimum required client version
 * @param context - Context string for warning message (e.g., 'header' or 'server')
 */
function warnIfClientVersionBelowMinimum(
  minClientVersion: string,
  context: 'header' | 'server'
): void {
  const clientSemver = semver.coerce(CLIENT_VERSION)
  const minSemver = semver.coerce(minClientVersion)

  if (clientSemver && minSemver && semver.lt(clientSemver, minSemver)) {
    const message =
      context === 'header'
        ? `Client version ${CLIENT_VERSION} is below minimum required version ${minClientVersion}. ` +
          `Please update submit-run-action.`
        : `Client version ${CLIENT_VERSION} may not be compatible with server. ` +
          `Minimum: ${minClientVersion}`
    core.warning(message)
  }
}

/**
 * Check version compatibility from response headers.
 * Logs warning if client version is below minimum required.
 *
 * @param headers - HTTP response headers (lowercase keys in axios)
 */
export function checkCompatibilityFromHeaders(
  headers: Record<string, string>
): void {
  const minClientVersion = headers['x-min-client-version']
  const apiVersion = headers['x-api-version']

  if (minClientVersion) {
    warnIfClientVersionBelowMinimum(minClientVersion, 'header')
  }

  core.debug(
    `Server API: ${apiVersion || 'unknown'}, X-Min-Client-Version: ${minClientVersion || 'not set'}`
  )
}

/**
 * Fetch server version info from /version endpoint on startup.
 * Returns version info if available, null on failure.
 *
 * @param baseUrl - Base URL of the Medusa API
 * @returns Version info object or null if request fails
 */
export async function fetchAndLogServerVersion(
  baseUrl: string
): Promise<VersionInfo | null> {
  try {
    const response = await axios.get<ServerVersionResponse>(
      `${baseUrl}/version`,
      { timeout: 5000 }
    )
    const data: ServerVersionResponse = response.data

    const serviceVersion = data.version || 'unknown'
    const apiVersion = data.api?.version || 'unknown'
    const minClientVersion = data.api?.min_compatible_client
    const gitSha = data.git?.sha_short || 'unknown'
    const serviceVersionLabel =
      serviceVersion === 'unknown'
        ? 'unknown'
        : serviceVersion.startsWith('v')
          ? serviceVersion
          : `v${serviceVersion}`

    core.info(`Connected to Medusa ${serviceVersionLabel} (API ${apiVersion})`)

    if (minClientVersion) {
      warnIfClientVersionBelowMinimum(minClientVersion, 'server')
    }

    return {
      apiVersion,
      serviceVersion,
      minClientVersion: minClientVersion || 'unknown',
      gitSha
    }
  } catch (error) {
    // Non-critical - just log debug and continue
    core.debug(`Could not fetch server version: ${error}`)
    return null
  }
}
