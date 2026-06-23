import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

describe('trust signal workflows and badges', () => {
  it('documents public action trust signals and support links', () => {
    const readme = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8')

    expect(readme).not.toContain(
      'AppSecureAI/submit-run-action/actions/workflows/ci.yml/badge.svg'
    )
    expect(readme).not.toContain(
      'AppSecureAI/automation-action/actions/workflows/ci.yml/badge.svg'
    )
    expect(readme).toContain('./badges/coverage.svg')
    expect(readme).toContain('https://img.shields.io/badge/License-MIT')
    expect(readme).toContain(
      'https://portal.cloud.appsecai.io/docs/configuration'
    )
    expect(readme).toContain('AppSecureAI/automation-action@v1')
    expect(readme).toContain(
      'https://github.com/AppSecureAI/automation-action/issues'
    )
  })

  it('runs CodeQL with pinned actions and code scanning permissions', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT_DIR, '.github', 'workflows', 'codeql.yml'),
      'utf8'
    )

    expect(workflow).toContain('name: CodeQL')
    expect(workflow).toContain('security-events: write')
    expect(workflow).toContain(
      'github/codeql-action/init@7211b7c8077ea37d8641b6271f6a365a22a5fbfa'
    )
    expect(workflow).toContain('languages: javascript-typescript')
    expect(workflow).toContain(
      'github/codeql-action/analyze@7211b7c8077ea37d8641b6271f6a365a22a5fbfa'
    )
    expect(workflow).toContain('continue-on-error: true')
    expect(workflow).toContain('Report CodeQL upload availability')
    expect(workflow).toContain('Enable GitHub Code Security/code scanning')
  })

  it('runs OpenSSF Scorecard with SARIF publication and pinned action', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT_DIR, '.github', 'workflows', 'scorecard.yml'),
      'utf8'
    )

    expect(workflow).toContain('name: OpenSSF Scorecard')
    expect(workflow).toContain('security-events: write')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain(
      'ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a'
    )
    expect(workflow).toContain('results_format: sarif')
    expect(workflow).toContain('publish_results: true')
  })
})
