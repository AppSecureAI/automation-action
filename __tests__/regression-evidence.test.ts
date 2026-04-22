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
  generateRegressionEvidence
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
})
