// __tests__/regression-evidence.test.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import { jest } from '@jest/globals'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const execFileMock = jest.fn()
const execMock = jest.fn()

jest.unstable_mockModule('node:child_process', () => ({
  execFile: execFileMock,
  exec: execMock
}))

const {
  parseChangedLinesFromUnifiedDiff,
  parseRegressionEvidenceArtifactListInput,
  parseRegressionEvidenceTestCommandsInput,
  generateRegressionEvidence,
  buildRegressionEvidenceCommentBody,
  upsertRegressionEvidencePrComment
} = await import('../src/regression-evidence.js')

describe('regression-evidence.ts', () => {
  it('parses changed lines from unified diff', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 111..222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,0 +4,2 @@',
      '+line 1',
      '+line 2',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -10,1 +20,1 @@',
      '-old',
      '+new'
    ].join('\n')

    expect(parseChangedLinesFromUnifiedDiff(diff)).toEqual([
      { file: 'src/a.ts', line: 4 },
      { file: 'src/a.ts', line: 5 },
      { file: 'src/b.ts', line: 20 }
    ])
  })

  it('ignores deleted files and malformed hunk headers', () => {
    const diff = [
      'diff --git a/src/deleted.ts b/src/deleted.ts',
      '--- a/src/deleted.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-old',
      'diff --git a/src/kept.ts b/src/kept.ts',
      '--- a/src/kept.ts',
      '+++ b/src/kept.ts',
      '@@ not a hunk @@',
      '+ignored',
      '@@ -3 +7 @@',
      '+kept'
    ].join('\n')

    expect(parseChangedLinesFromUnifiedDiff(diff)).toEqual([
      { file: 'src/kept.ts', line: 7 }
    ])
  })

  it('parses artifact and command list inputs', () => {
    expect(
      parseRegressionEvidenceArtifactListInput(
        'coverage/a.json,coverage/b.json'
      )
    ).toEqual(['coverage/a.json', 'coverage/b.json'])

    expect(
      parseRegressionEvidenceTestCommandsInput(
        'npm test -- {{tests}}\nnode scripts/verify.js'
      )
    ).toEqual(['npm test -- {{tests}}', 'node scripts/verify.js'])

    expect(parseRegressionEvidenceArtifactListInput('   ')).toEqual([])
    expect(parseRegressionEvidenceTestCommandsInput('   ')).toEqual([])
  })

  it('maps coverage from files object and verifies impacted tests', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'reg-evidence-files-'))

    try {
      const coveragePath = path.join(tmpDir, 'line-map.json')
      await writeFile(
        coveragePath,
        JSON.stringify({
          files: {
            'src/a.ts': {
              lines: {
                '4': [{ name: '__tests__/a.test.ts', confidence: 'high' }],
                '5': '__tests__/a.test.ts'
              }
            }
          }
        }),
        'utf8'
      )

      execFileMock.mockImplementation((...args: unknown[]) => {
        const callback = args[3] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(
          null,
          [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,0 +4,2 @@',
            '+line 1',
            '+line 2'
          ].join('\n'),
          ''
        )
      })
      execMock.mockImplementation((...args: unknown[]) => {
        const callback = args[2] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(null, 'ok', '')
      })

      const result = await generateRegressionEvidence({
        cwd: tmpDir,
        baseRef: null,
        baseSha: 'base-sha',
        headRef: null,
        headSha: 'head-sha',
        coverageArtifactPaths: [coveragePath],
        testCommands: ['npm test -- {{tests}}'],
        outputJsonPath: 'regression-evidence.json',
        outputMarkdownPath: 'regression-evidence.md',
        allowPartial: false
      })

      expect(result.artifact.status).toBe('verified')
      expect(
        result.artifact.existing_test_coverage_match_summary
      ).toMatchObject({
        mapped_tests: 1,
        high_confidence_tests: 1
      })
      expect(result.artifact.executed_test_commands).toEqual([
        'npm test -- __tests__/a.test.ts'
      ])
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        ['diff', '--unified=0', '--no-color', 'base-sha', 'head-sha'],
        { cwd: tmpDir },
        expect.any(Function)
      )
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('uses heuristic test matching when no coverage mappings exist', async () => {
    const tmpDir = await mkdtemp(
      path.join(os.tmpdir(), 'reg-evidence-heuristic-')
    )

    try {
      await mkdir(path.join(tmpDir, '__tests__'), { recursive: true })
      await writeFile(path.join(tmpDir, '__tests__', 'a.test.ts'), '', 'utf8')
      const coveragePath = path.join(tmpDir, 'empty.json')
      await writeFile(coveragePath, JSON.stringify({}), 'utf8')

      execFileMock.mockImplementation((...args: unknown[]) => {
        const callback = args[3] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(
          null,
          [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,0 +4,1 @@',
            '+line 1'
          ].join('\n'),
          ''
        )
      })

      const result = await generateRegressionEvidence({
        cwd: tmpDir,
        baseRef: 'origin/main',
        baseSha: null,
        headRef: 'HEAD',
        headSha: null,
        coverageArtifactPaths: [coveragePath],
        testCommands: [],
        outputJsonPath: 'regression-evidence.json',
        outputMarkdownPath: 'regression-evidence.md',
        allowPartial: true
      })

      expect(result.artifact.status).toBe('partial')
      expect(
        result.artifact.existing_test_coverage_match_summary
      ).toMatchObject({
        mapped_tests: 1,
        medium_confidence_tests: 1
      })
      expect(result.artifact.impacted_test_execution_summary).toMatchObject({
        selected_tests: 1,
        skipped_tests: 1
      })
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('generates artifacts with partial status when uncovered lines remain', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'reg-evidence-'))

    try {
      const coverageDir = path.join(tmpDir, 'coverage')
      await mkdir(coverageDir, { recursive: true })
      const coveragePath = path.join(coverageDir, 'line-map.json')
      await writeFile(
        coveragePath,
        JSON.stringify({
          line_test_mapping: [
            {
              file: 'src/a.ts',
              line: 4,
              tests: [{ name: '__tests__/a.test.ts', confidence: 'high' }]
            }
          ]
        }),
        'utf8'
      )

      execFileMock.mockImplementation((...args: unknown[]) => {
        const callback = args[3] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(
          null,
          [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,0 +4,2 @@',
            '+line 1',
            '+line 2'
          ].join('\n'),
          ''
        )
      })
      execMock.mockImplementation((...args: unknown[]) => {
        const callback = args[2] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(null, '', '')
      })

      const result = await generateRegressionEvidence({
        cwd: tmpDir,
        baseRef: 'origin/main',
        baseSha: null,
        headRef: 'HEAD',
        headSha: null,
        coverageArtifactPaths: [coveragePath],
        testCommands: [],
        outputJsonPath: 'artifacts/regression-evidence.json',
        outputMarkdownPath: 'artifacts/regression-evidence.md',
        allowPartial: true
      })

      expect(result.artifact.status).toBe('partial')
      expect(result.artifact.changed_code_summary.lines_changed).toBe(2)
      expect(
        result.artifact.existing_test_coverage_match_summary.mapped_tests
      ).toBe(1)
      expect(result.artifact.uncovered_changed_lines).toEqual([
        { file: 'src/a.ts', line: 5 }
      ])

      const jsonArtifact = JSON.parse(await readFile(result.jsonPath, 'utf8'))
      const markdownArtifact = await readFile(result.markdownPath, 'utf8')
      expect(jsonArtifact.schema_version).toBe(1)
      expect(markdownArtifact).toContain('## Regression Evidence')
      expect(markdownArtifact).toContain('final status: **partial**')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('marks status at_risk when impacted test command fails', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'reg-evidence-fail-'))

    try {
      const coverageDir = path.join(tmpDir, 'coverage')
      await mkdir(coverageDir, { recursive: true })
      const coveragePath = path.join(coverageDir, 'line-map.json')
      await writeFile(
        coveragePath,
        JSON.stringify({
          line_test_mapping: [
            {
              file: 'src/a.ts',
              line: 4,
              tests: [{ name: '__tests__/a.test.ts', confidence: 'high' }]
            }
          ]
        }),
        'utf8'
      )

      execFileMock.mockImplementation((...args: unknown[]) => {
        const callback = args[3] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(
          null,
          [
            'diff --git a/src/a.ts b/src/a.ts',
            '--- a/src/a.ts',
            '+++ b/src/a.ts',
            '@@ -1,0 +4,1 @@',
            '+line 1'
          ].join('\n'),
          ''
        )
      })
      execMock.mockImplementation((...args: unknown[]) => {
        const callback = args[2] as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        callback(new Error('test command failed'), '', '')
      })

      const result = await generateRegressionEvidence({
        cwd: tmpDir,
        baseRef: 'origin/main',
        baseSha: null,
        headRef: 'HEAD',
        headSha: null,
        coverageArtifactPaths: [coveragePath],
        testCommands: ['npm test -- {{tests}}'],
        outputJsonPath: 'regression-evidence.json',
        outputMarkdownPath: 'regression-evidence.md',
        allowPartial: true
      })

      expect(result.artifact.status).toBe('at_risk')
      expect(result.artifact.impacted_test_execution_summary.failed_tests).toBe(
        1
      )
      expect(result.artifact.executed_test_commands).toEqual([
        'npm test -- __tests__/a.test.ts'
      ])
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('creates and updates regression evidence comments', async () => {
    const createComment = jest
      .fn<() => Promise<{ data: { id: number } }>>()
      .mockResolvedValue({ data: { id: 20 } })
    const updateComment = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({})
    const listComments = jest
      .fn<() => Promise<{ data: Array<{ id: number; body?: string }> }>>()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 10,
            body: buildRegressionEvidenceCommentBody('old markdown')
          }
        ]
      })
    const client = {
      rest: {
        issues: {
          listComments,
          createComment,
          updateComment
        }
      }
    }

    await expect(
      upsertRegressionEvidencePrComment(
        client as Parameters<typeof upsertRegressionEvidencePrComment>[0],
        'AppSecureAI',
        'Product',
        123,
        'new markdown'
      )
    ).resolves.toEqual({ action: 'created', commentId: 20 })

    await expect(
      upsertRegressionEvidencePrComment(
        client as Parameters<typeof upsertRegressionEvidencePrComment>[0],
        'AppSecureAI',
        'Product',
        123,
        'updated markdown'
      )
    ).resolves.toEqual({ action: 'updated', commentId: 10 })

    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'AppSecureAI',
        repo: 'Product',
        issue_number: 123,
        body: expect.stringContaining('new markdown')
      })
    )
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 10,
        body: expect.stringContaining('updated markdown')
      })
    )
  })
})
