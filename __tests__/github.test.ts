// __tests__/github.test.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

/**
 * Unit tests for src/github.ts
 */

import { jest } from '@jest/globals'

import * as core from '../__fixtures__/core.js'

import github from '../__fixtures__/github.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', github)

const { getRepoInfo, getIdToken, getActor } = await import('../src/github.js')

describe('github.ts', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  describe('getRepoInfo', () => {
    it('returns an object with a owner and a repo fields', () => {
      expect(getRepoInfo()).toStrictEqual({
        owner: 'onwer',
        repo: 'repo'
      })
    })
  })

  describe('getActor', () => {
    it('returns the actor (user) who triggered the workflow, not the action name', () => {
      // This test verifies the fix for the bug where getActor() was
      // returning github.context.action instead of github.context.actor
      expect(getActor()).toBe('test-user')
    })
  })

  describe('getIDToken', () => {
    beforeAll(() => {
      core.getIDToken.mockImplementation(async () => 'asd3xf43')
    })

    afterEach(() => {
      jest.resetModules()
      jest.clearAllMocks()
    })

    it('returns a token based on a passed url', async () => {
      const token = await getIdToken('http://some-url.com')
      expect(token).toStrictEqual('asd3xf43')
    })

    it('given a empty url it must throw an error', async () => {
      core.getIDToken.mockClear()

      await expect(async () => {
        await getIdToken('')
      }).rejects.toThrow('apiUrl must be Provided')
    })

    it('given an exception when trying to get an ID token, it must be handled properly and return an empty string', async () => {
      core.getIDToken.mockClear()
      core.getIDToken.mockImplementation(async () => Promise.reject(''))

      const token = await getIdToken('http://some-url.com')

      expect(token).toStrictEqual('')
    })
  })
})
