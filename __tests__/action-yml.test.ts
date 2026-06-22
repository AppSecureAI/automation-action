// __tests__/action-yml.test.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.

import fs from 'fs'
import path from 'path'

describe('action.yml', () => {
  it('uses a JavaScript action with a cancellation cleanup hook', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )

    expect(actionYaml).toContain('files:')
    expect(actionYaml).toContain('using: node24')
    expect(actionYaml).toContain('main: dist/index.js')
    expect(actionYaml).toContain('post: dist/cleanup.js')
    expect(actionYaml).toContain('post-if: cancelled()')
    expect(actionYaml).not.toContain('using: composite')
    expect(actionYaml).not.toContain('actions/setup-node')
  })

  it('declares the allow-missing-repo-access input and plumbs it through', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )

    expect(actionYaml).toContain('allow-missing-repo-access:')
    // Under the node24 runtime the input is read directly (with env var
    // fallbacks) instead of through a composite INPUT_* mapping.
    expect(inputSource).toContain("'allow-missing-repo-access'")
    expect(inputSource).toContain('ALLOW_MISSING_REPO_ACCESS')
  })

  it('passes the PR audience input through to the Node runtime', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )

    expect(actionYaml).toContain('pr-audience:')
    // Under the node24 runtime the input is read directly (with env var
    // fallbacks) instead of through a composite INPUT_* mapping.
    expect(inputSource).toContain(
      "getInputValue('pr-audience', 'INPUT_PR_AUDIENCE', 'PR_AUDIENCE')"
    )
  })

  it('does not expose the internal llm-profile control as a public action input', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )

    // llm-profile is an internal LLM-routing control. It must not appear as a
    // public action input (action.yml is mirrored verbatim to the public
    // AppSecureAI/automation-action repo and the GitHub Marketplace listing),
    // and the internal profile names must never be advertised to customers.
    expect(actionYaml).not.toContain('llm-profile:')
    expect(actionYaml).not.toContain('prod, cheap, balanced, final, or mock')

    // The control is still accepted internally via env vars (used by the
    // internal scan-triage-remediation workflows through APPSECAI_LLM_PROFILE),
    // so the env-var fallback path must remain in place.
    expect(inputSource).toContain("'llm-profile',")
    expect(inputSource).toContain("'INPUT_LLM_PROFILE',")
    expect(inputSource).toContain("'APPSECAI_LLM_PROFILE'")
  })

  it('does not expose the internal experiment control as a public action input', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )

    expect(actionYaml).not.toContain('experiment:')
    expect(inputSource).toContain("'experiment',")
    expect(inputSource).toContain("'INPUT_EXPERIMENT',")
    expect(inputSource).toContain("'APPSECAI_EXPERIMENT'")
  })

  it('keeps public metadata focused on production usage', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )

    expect(actionYaml).toContain('Leave unset unless AppSecAI Support provides')
    expect(actionYaml).toContain('Use')
    expect(actionYaml).toContain('either file or files, not both')
    expect(actionYaml).not.toContain('non-production')
    expect(actionYaml).not.toContain('pre-release')
  })
})
