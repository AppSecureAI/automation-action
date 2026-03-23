// src/regression-evidence.ts
// Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
// This software and its source code are the proprietary information of AppSecAI, Inc.
// Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

import * as core from '@actions/core'
import * as github from '@actions/github'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  execFile as execFileCallback,
  exec as execCallback
} from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const exec = promisify(execCallback)

const DEFAULT_MAX_UNCOVERED_LINES = 20
export const REGRESSION_EVIDENCE_COMMENT_MARKER =
  '<!-- appsecai-regression-evidence-comment -->'

export const RegressionEvidenceStatus = {
  VERIFIED: 'verified',
  PARTIAL: 'partial',
  AT_RISK: 'at_risk'
} as const

export type RegressionEvidenceStatus =
  (typeof RegressionEvidenceStatus)[keyof typeof RegressionEvidenceStatus]

export const RegressionEvidenceConfidence = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const

export type RegressionEvidenceConfidence =
  (typeof RegressionEvidenceConfidence)[keyof typeof RegressionEvidenceConfidence]

export interface ChangedLine {
  file: string
  line: number
}

export interface MappedTest {
  name: string
  confidence: RegressionEvidenceConfidence
  source: 'coverage' | 'heuristic'
  matched_lines: ChangedLine[]
}

export interface RegressionEvidenceArtifact {
  schema_version: 1
  generated_at: string
  base: {
    ref: string | null
    sha: string | null
  }
  head: {
    ref: string | null
    sha: string | null
  }
  changed_code_summary: {
    files_changed: number
    lines_changed: number
  }
  existing_test_coverage_match_summary: {
    mapped_tests: number
    high_confidence_tests: number
    medium_confidence_tests: number
    low_confidence_tests: number
  }
  impacted_test_execution_summary: {
    selected_tests: number
    executed_tests: number
    passed_tests: number
    failed_tests: number
    skipped_tests: number
  }
  uncovered_changed_lines: ChangedLine[]
  coverage_artifact_paths: string[]
  executed_test_commands: string[]
  status: RegressionEvidenceStatus
}

export interface RegressionEvidenceGenerationConfig {
  cwd: string
  baseRef: string | null
  baseSha: string | null
  headRef: string | null
  headSha: string | null
  coverageArtifactPaths: string[]
  testCommands: string[]
  outputJsonPath: string
  outputMarkdownPath: string
  allowPartial: boolean
}

export interface RegressionEvidenceGenerationResult {
  artifact: RegressionEvidenceArtifact
  markdown: string
  jsonPath: string
  markdownPath: string
}

interface CoverageLineMapping {
  file: string
  line: number
  tests: Array<{ name: string; confidence: RegressionEvidenceConfidence }>
}

interface CoverageMappingResult {
  mappedTests: MappedTest[]
  uncoveredChangedLines: ChangedLine[]
}

interface TestExecutionResult {
  executedCommands: string[]
  selectedTests: number
  executedTests: number
  passedTests: number
  failedTests: number
  skippedTests: number
}

type CommentAction = 'created' | 'updated'

interface CommentListResponse {
  data: Array<{ id: number; body?: string | null }>
}

interface CommentCreateResponse {
  data: { id: number }
}

interface RegressionEvidenceCommentClient {
  rest: {
    issues: {
      listComments: (params: {
        owner: string
        repo: string
        issue_number: number
        per_page: number
      }) => Promise<CommentListResponse>
      updateComment: (params: {
        owner: string
        repo: string
        comment_id: number
        body: string
      }) => Promise<unknown>
      createComment: (params: {
        owner: string
        repo: string
        issue_number: number
        body: string
      }) => Promise<CommentCreateResponse>
    }
  }
}

function toPosixFilePath(input: string): string {
  return input
    .replaceAll('\\\\', '/')
    .replace(/^\.?\//, '')
    .replace(/^a\//, '')
    .replace(/^b\//, '')
}

function confidenceRank(value: RegressionEvidenceConfidence): number {
  if (value === RegressionEvidenceConfidence.HIGH) {
    return 3
  }
  if (value === RegressionEvidenceConfidence.MEDIUM) {
    return 2
  }
  return 1
}

function coerceConfidence(value: unknown): RegressionEvidenceConfidence {
  if (typeof value !== 'string') {
    return RegressionEvidenceConfidence.LOW
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === RegressionEvidenceConfidence.HIGH) {
    return RegressionEvidenceConfidence.HIGH
  }
  if (normalized === RegressionEvidenceConfidence.MEDIUM) {
    return RegressionEvidenceConfidence.MEDIUM
  }
  return RegressionEvidenceConfidence.LOW
}

function parseArtifactList(raw: string): string[] {
  if (!raw.trim()) {
    return []
  }

  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseCommandList(raw: string): string[] {
  if (!raw.trim()) {
    return []
  }

  return raw
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseHunkHeader(
  line: string
): { start: number; count: number } | null {
  const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (!match) {
    return null
  }

  const start = Number(match[1])
  const count = match[2] ? Number(match[2]) : 1
  if (!Number.isInteger(start) || !Number.isInteger(count)) {
    return null
  }

  return { start, count }
}

export function parseChangedLinesFromUnifiedDiff(
  diffOutput: string
): ChangedLine[] {
  const changedLines: ChangedLine[] = []
  const lines = diffOutput.split('\n')

  let currentFile = ''

  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const rawFile = line.slice(4).trim()
      if (rawFile === '/dev/null') {
        currentFile = ''
        continue
      }
      currentFile = toPosixFilePath(rawFile)
      continue
    }

    if (!line.startsWith('@@ ') || !currentFile) {
      continue
    }

    const parsedHunk = parseHunkHeader(line)
    if (!parsedHunk || parsedHunk.count <= 0) {
      continue
    }

    for (let index = 0; index < parsedHunk.count; index += 1) {
      changedLines.push({
        file: currentFile,
        line: parsedHunk.start + index
      })
    }
  }

  return changedLines
}

async function readCoverageArtifacts(paths: string[]): Promise<unknown[]> {
  const documents: unknown[] = []

  for (const artifactPath of paths) {
    const raw = await readFile(artifactPath, 'utf8')
    documents.push(JSON.parse(raw) as unknown)
  }

  return documents
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
}

function collectTestsFromValue(
  value: unknown
): Array<{ name: string; confidence: RegressionEvidenceConfidence }> {
  if (typeof value === 'string' && value.trim()) {
    return [
      { name: value.trim(), confidence: RegressionEvidenceConfidence.MEDIUM }
    ]
  }

  if (Array.isArray(value)) {
    const collected: Array<{
      name: string
      confidence: RegressionEvidenceConfidence
    }> = []
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        collected.push({
          name: entry.trim(),
          confidence: RegressionEvidenceConfidence.MEDIUM
        })
        continue
      }

      const record = asRecord(entry)
      if (!record) {
        continue
      }

      const name =
        (typeof record.name === 'string' && record.name.trim()) ||
        (typeof record.test === 'string' && record.test.trim()) ||
        (typeof record.id === 'string' && record.id.trim())

      if (!name) {
        continue
      }

      collected.push({
        name,
        confidence: coerceConfidence(record.confidence)
      })
    }

    return collected
  }

  return []
}

function collectCoverageMappings(document: unknown): CoverageLineMapping[] {
  const root = asRecord(document)
  if (!root) {
    return []
  }

  const mappings: CoverageLineMapping[] = []

  const directMappings = asArray(root.line_test_mapping)
  for (const rawEntry of directMappings) {
    const entry = asRecord(rawEntry)
    if (!entry) {
      continue
    }

    const fileRaw =
      (typeof entry.file === 'string' && entry.file) ||
      (typeof entry.path === 'string' && entry.path)
    const lineRaw =
      typeof entry.line === 'number'
        ? entry.line
        : typeof entry.line === 'string'
          ? Number(entry.line)
          : undefined

    const lineNumber =
      typeof lineRaw === 'number' && Number.isInteger(lineRaw) && lineRaw > 0
        ? lineRaw
        : null

    if (!fileRaw || lineNumber === null) {
      continue
    }

    const tests = collectTestsFromValue(entry.tests)
    if (tests.length === 0) {
      continue
    }

    mappings.push({
      file: toPosixFilePath(fileRaw),
      line: lineNumber,
      tests
    })
  }

  const fileMappings = asRecord(root.files)
  if (!fileMappings) {
    return mappings
  }

  for (const [fileKey, fileValue] of Object.entries(fileMappings)) {
    const fileRecord = asRecord(fileValue)
    if (!fileRecord) {
      continue
    }

    const lineRecord = asRecord(fileRecord.lines)
    if (!lineRecord) {
      continue
    }

    for (const [lineKey, lineValue] of Object.entries(lineRecord)) {
      const line = Number(lineKey)
      if (!Number.isInteger(line) || line <= 0) {
        continue
      }

      const tests = collectTestsFromValue(lineValue)
      if (tests.length === 0) {
        continue
      }

      mappings.push({
        file: toPosixFilePath(fileKey),
        line,
        tests
      })
    }
  }

  return mappings
}

function mapChangedLinesWithCoverage(
  changedLines: ChangedLine[],
  coverageDocuments: unknown[]
): CoverageMappingResult {
  const lineMap = new Map<
    string,
    Array<{ name: string; confidence: RegressionEvidenceConfidence }>
  >()

  for (const document of coverageDocuments) {
    const mappings = collectCoverageMappings(document)
    for (const mapping of mappings) {
      const key = `${mapping.file}:${mapping.line}`
      const existing = lineMap.get(key) ?? []
      existing.push(...mapping.tests)
      lineMap.set(key, existing)
    }
  }

  const mappedTests = new Map<string, MappedTest>()
  const uncoveredChangedLines: ChangedLine[] = []

  for (const changedLine of changedLines) {
    const key = `${toPosixFilePath(changedLine.file)}:${changedLine.line}`
    const tests = lineMap.get(key)

    if (!tests || tests.length === 0) {
      uncoveredChangedLines.push(changedLine)
      continue
    }

    for (const test of tests) {
      const existing = mappedTests.get(test.name)
      if (!existing) {
        mappedTests.set(test.name, {
          name: test.name,
          confidence: test.confidence,
          source: 'coverage',
          matched_lines: [changedLine]
        })
        continue
      }

      if (
        confidenceRank(test.confidence) > confidenceRank(existing.confidence)
      ) {
        existing.confidence = test.confidence
      }
      existing.matched_lines.push(changedLine)
    }
  }

  return {
    mappedTests: Array.from(mappedTests.values()),
    uncoveredChangedLines
  }
}

function getCandidateTestPaths(file: string): string[] {
  const normalized = toPosixFilePath(file)
  const parsed = path.posix.parse(normalized)

  const extensions = ['.ts', '.tsx', '.js', '.jsx']
  const baseWithoutExt = parsed.name

  const inSourceDir = parsed.dir.startsWith('src/')
    ? parsed.dir.replace(/^src\//, '')
    : parsed.dir

  const candidates = new Set<string>()

  if (/\.(test|spec)\.[jt]sx?$/.test(normalized)) {
    candidates.add(normalized)
  }

  for (const ext of extensions) {
    candidates.add(path.posix.join(parsed.dir, `${baseWithoutExt}.test${ext}`))
    candidates.add(path.posix.join(parsed.dir, `${baseWithoutExt}.spec${ext}`))
    candidates.add(
      path.posix.join(parsed.dir, '__tests__', `${baseWithoutExt}.test${ext}`)
    )
    candidates.add(
      path.posix.join(parsed.dir, '__tests__', `${baseWithoutExt}.spec${ext}`)
    )
    candidates.add(path.posix.join('__tests__', `${baseWithoutExt}.test${ext}`))
    candidates.add(path.posix.join('__tests__', `${baseWithoutExt}.spec${ext}`))

    if (inSourceDir) {
      candidates.add(
        path.posix.join(
          '__tests__',
          inSourceDir,
          `${baseWithoutExt}.test${ext}`
        )
      )
      candidates.add(
        path.posix.join(
          '__tests__',
          inSourceDir,
          `${baseWithoutExt}.spec${ext}`
        )
      )
      candidates.add(
        path.posix.join('tests', inSourceDir, `${baseWithoutExt}.test${ext}`)
      )
      candidates.add(
        path.posix.join('tests', inSourceDir, `${baseWithoutExt}.spec${ext}`)
      )
    }
  }

  return Array.from(candidates)
}

async function applyHeuristicFallback(
  changedLines: ChangedLine[],
  currentlyMapped: MappedTest[],
  cwd: string
): Promise<MappedTest[]> {
  if (currentlyMapped.length > 0) {
    return currentlyMapped
  }

  const addedTests = new Map<string, MappedTest>()

  for (const changedLine of changedLines) {
    const candidates = getCandidateTestPaths(changedLine.file)
    for (const candidate of candidates) {
      const fullPath = path.resolve(cwd, candidate)
      try {
        await access(fullPath)
      } catch {
        continue
      }

      const existing = addedTests.get(candidate)
      if (existing) {
        existing.matched_lines.push(changedLine)
      } else {
        addedTests.set(candidate, {
          name: candidate,
          confidence: /\.(test|spec)\.[jt]sx?$/.test(candidate)
            ? RegressionEvidenceConfidence.MEDIUM
            : RegressionEvidenceConfidence.LOW,
          source: 'heuristic',
          matched_lines: [changedLine]
        })
      }
    }
  }

  return Array.from(addedTests.values())
}

function buildMarkdown(
  artifact: RegressionEvidenceArtifact,
  maxUncoveredLines = DEFAULT_MAX_UNCOVERED_LINES
): string {
  const lines: string[] = []
  lines.push('## Regression Evidence')
  lines.push(
    `- changed files/lines: ${artifact.changed_code_summary.files_changed}/${artifact.changed_code_summary.lines_changed}`
  )

  const coverage = artifact.existing_test_coverage_match_summary
  lines.push(
    `- mapped tests: ${coverage.mapped_tests} (high ${coverage.high_confidence_tests}, medium ${coverage.medium_confidence_tests}, low ${coverage.low_confidence_tests})`
  )

  const execution = artifact.impacted_test_execution_summary
  lines.push(
    `- impacted tests: selected ${execution.selected_tests}, executed ${execution.executed_tests}, passed ${execution.passed_tests}, failed ${execution.failed_tests}, skipped ${execution.skipped_tests}`
  )

  const uncoveredPreview = artifact.uncovered_changed_lines.slice(
    0,
    maxUncoveredLines
  )
  lines.push(
    `- uncovered changed lines: ${artifact.uncovered_changed_lines.length}`
  )

  if (uncoveredPreview.length === 0) {
    lines.push('  - None')
  } else {
    for (const line of uncoveredPreview) {
      lines.push(`  - ${line.file}:${line.line}`)
    }
    if (artifact.uncovered_changed_lines.length > uncoveredPreview.length) {
      lines.push(
        `  - ...and ${artifact.uncovered_changed_lines.length - uncoveredPreview.length} more`
      )
    }
  }

  lines.push(`- final status: **${artifact.status}**`)
  lines.push('- artifact: generated markdown file')

  return lines.join('\n')
}

function countChangedFiles(changedLines: ChangedLine[]): number {
  return new Set(changedLines.map((line) => line.file)).size
}

function countByConfidence(
  mappedTests: MappedTest[],
  confidence: RegressionEvidenceConfidence
): number {
  return mappedTests.filter((test) => test.confidence === confidence).length
}

function evaluateStatus(
  uncoveredChangedLines: ChangedLine[],
  mappedTests: MappedTest[],
  failedTests: number,
  allowPartial: boolean
): RegressionEvidenceStatus {
  if (failedTests > 0) {
    return RegressionEvidenceStatus.AT_RISK
  }

  if (uncoveredChangedLines.length === 0 && mappedTests.length > 0) {
    return RegressionEvidenceStatus.VERIFIED
  }

  if (allowPartial && mappedTests.length > 0) {
    return RegressionEvidenceStatus.PARTIAL
  }

  return RegressionEvidenceStatus.AT_RISK
}

function resolveGitTarget(
  ref: string | null,
  sha: string | null,
  fallback: string
): string {
  if (sha && sha.trim()) {
    return sha.trim()
  }
  if (ref && ref.trim()) {
    return ref.trim()
  }
  return fallback
}

async function collectChangedLinesFromGit(
  cwd: string,
  baseRef: string | null,
  baseSha: string | null,
  headRef: string | null,
  headSha: string | null
): Promise<ChangedLine[]> {
  const baseTarget = resolveGitTarget(baseRef, baseSha, 'origin/main')
  const headTarget = resolveGitTarget(headRef, headSha, 'HEAD')

  const diffResult = await execFile(
    'git',
    ['diff', '--unified=0', '--no-color', baseTarget, headTarget],
    { cwd }
  )
  const stdout =
    typeof diffResult === 'string'
      ? diffResult
      : ((diffResult.stdout as string | undefined) ?? '')

  return parseChangedLinesFromUnifiedDiff(stdout)
}

async function executeImpactedTests(
  cwd: string,
  testCommands: string[],
  mappedTests: MappedTest[]
): Promise<TestExecutionResult> {
  const selectedTests = mappedTests.map((test) => test.name)

  if (testCommands.length === 0) {
    return {
      executedCommands: [],
      selectedTests: selectedTests.length,
      executedTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: selectedTests.length
    }
  }

  const executedCommands: string[] = []
  let failedCommands = 0

  for (const command of testCommands) {
    const renderedCommand = command.includes('{{tests}}')
      ? command.replace('{{tests}}', selectedTests.join(' '))
      : command

    executedCommands.push(renderedCommand)

    try {
      await exec(renderedCommand, {
        cwd,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024
      })
    } catch {
      failedCommands += 1
      core.warning(
        `Regression evidence test command failed: ${renderedCommand}`
      )
    }
  }

  if (selectedTests.length > 0) {
    const failedTests = failedCommands > 0 ? selectedTests.length : 0
    return {
      executedCommands,
      selectedTests: selectedTests.length,
      executedTests: selectedTests.length,
      passedTests: failedTests === 0 ? selectedTests.length : 0,
      failedTests,
      skippedTests: 0
    }
  }

  return {
    executedCommands,
    selectedTests: 0,
    executedTests: executedCommands.length,
    passedTests: Math.max(0, executedCommands.length - failedCommands),
    failedTests: failedCommands,
    skippedTests: 0
  }
}

async function writeArtifacts(
  artifact: RegressionEvidenceArtifact,
  markdown: string,
  outputJsonPath: string,
  outputMarkdownPath: string,
  cwd: string
): Promise<{ jsonPath: string; markdownPath: string }> {
  const jsonPath = path.resolve(cwd, outputJsonPath)
  const markdownPath = path.resolve(cwd, outputMarkdownPath)

  await mkdir(path.dirname(jsonPath), { recursive: true })
  await mkdir(path.dirname(markdownPath), { recursive: true })

  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  await writeFile(markdownPath, `${markdown}\n`, 'utf8')

  return { jsonPath, markdownPath }
}

export async function generateRegressionEvidence(
  config: RegressionEvidenceGenerationConfig
): Promise<RegressionEvidenceGenerationResult> {
  const changedLines = await collectChangedLinesFromGit(
    config.cwd,
    config.baseRef,
    config.baseSha,
    config.headRef,
    config.headSha
  )

  const coverageDocuments = await readCoverageArtifacts(
    config.coverageArtifactPaths
  )
  const coverageMapping = mapChangedLinesWithCoverage(
    changedLines,
    coverageDocuments
  )

  const mappedTests = await applyHeuristicFallback(
    changedLines,
    coverageMapping.mappedTests,
    config.cwd
  )

  const execution = await executeImpactedTests(
    config.cwd,
    config.testCommands,
    mappedTests
  )

  const status = evaluateStatus(
    coverageMapping.uncoveredChangedLines,
    mappedTests,
    execution.failedTests,
    config.allowPartial
  )

  const artifact: RegressionEvidenceArtifact = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    base: {
      ref: config.baseRef,
      sha: config.baseSha
    },
    head: {
      ref: config.headRef,
      sha: config.headSha
    },
    changed_code_summary: {
      files_changed: countChangedFiles(changedLines),
      lines_changed: changedLines.length
    },
    existing_test_coverage_match_summary: {
      mapped_tests: mappedTests.length,
      high_confidence_tests: countByConfidence(
        mappedTests,
        RegressionEvidenceConfidence.HIGH
      ),
      medium_confidence_tests: countByConfidence(
        mappedTests,
        RegressionEvidenceConfidence.MEDIUM
      ),
      low_confidence_tests: countByConfidence(
        mappedTests,
        RegressionEvidenceConfidence.LOW
      )
    },
    impacted_test_execution_summary: {
      selected_tests: execution.selectedTests,
      executed_tests: execution.executedTests,
      passed_tests: execution.passedTests,
      failed_tests: execution.failedTests,
      skipped_tests: execution.skippedTests
    },
    uncovered_changed_lines: coverageMapping.uncoveredChangedLines,
    coverage_artifact_paths: config.coverageArtifactPaths,
    executed_test_commands: execution.executedCommands,
    status
  }

  const markdown = buildMarkdown(artifact)
  const paths = await writeArtifacts(
    artifact,
    markdown,
    config.outputJsonPath,
    config.outputMarkdownPath,
    config.cwd
  )

  return {
    artifact,
    markdown,
    jsonPath: paths.jsonPath,
    markdownPath: paths.markdownPath
  }
}

export function parseRegressionEvidenceArtifactListInput(
  raw: string
): string[] {
  return parseArtifactList(raw)
}

export function parseRegressionEvidenceTestCommandsInput(
  raw: string
): string[] {
  return parseCommandList(raw)
}

export function buildRegressionEvidenceCommentBody(markdown: string): string {
  return `${markdown}\n\n${REGRESSION_EVIDENCE_COMMENT_MARKER}`
}

export async function upsertRegressionEvidencePrComment(
  client: RegressionEvidenceCommentClient,
  owner: string,
  repo: string,
  issueNumber: number,
  markdown: string
): Promise<{ action: CommentAction; commentId: number }> {
  const body = buildRegressionEvidenceCommentBody(markdown)
  const comments = await client.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  })

  const existing = comments.data.find(
    (comment) =>
      typeof comment.body === 'string' &&
      comment.body.includes(REGRESSION_EVIDENCE_COMMENT_MARKER)
  )

  if (existing) {
    await client.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body
    })
    return { action: 'updated', commentId: existing.id }
  }

  const created = await client.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body
  })
  return { action: 'created', commentId: created.data.id }
}

export async function publishRegressionEvidenceCommentFromContext(
  markdown: string,
  token: string
): Promise<CommentAction | 'skipped'> {
  if (!token) {
    core.warning(
      'Regression evidence PR comment publishing requested, but no token was provided (set GITHUB_TOKEN or token input).'
    )
    return 'skipped'
  }

  const issueNumber =
    github.context.payload.pull_request?.number || github.context.issue.number
  if (!issueNumber) {
    core.warning(
      'Regression evidence PR comment publishing requested, but workflow is not running in a pull request context.'
    )
    return 'skipped'
  }

  const { owner, repo } = github.context.repo
  const octokit = github.getOctokit(token)
  const result = await upsertRegressionEvidencePrComment(
    octokit as RegressionEvidenceCommentClient,
    owner,
    repo,
    issueNumber,
    markdown
  )
  return result.action
}
