// src/github.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as github from '@actions/github'
import * as core from '@actions/core'

import { RepoInfo } from './types.js'

export async function getIdToken(apiUrl: string) {
  if (!apiUrl) {
    throw new Error('apiUrl must be Provided')
  }
  let token = ''
  try {
    token = await core.getIDToken(apiUrl)
  } catch (error) {
    core.debug(`Error getting ID token, error: ${error}`)
    // Fallback: get from input (which can be set from env)
    if (!token) {
      core.debug('Fallback to token from token input')
      token = core.getInput('token') ?? ''
    }
  }

  return token
}

export function getRepoInfo(): RepoInfo {
  return github.context.repo
}

export function getActor(): string {
  return github.context.actor
}
