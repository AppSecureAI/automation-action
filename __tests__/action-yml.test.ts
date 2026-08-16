// __tests__/action-yml.test.ts

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
    // Under the node24 runtime the explicit action input must win before
    // falling back to INPUT_PR_AUDIENCE and PR_AUDIENCE.
    expect(inputSource).toContain("core.getInput('pr-audience')")
    expect(inputSource).toContain('process.env.INPUT_PR_AUDIENCE')
    expect(inputSource).toContain('process.env.PR_AUDIENCE')
  })

  it('declares the long-run handoff input and pending outputs', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )

    expect(actionYaml).toContain('allow-long-run-handoff:')
    expect(actionYaml).toContain('run-status:')
    expect(actionYaml).toContain('run-complete:')
    expect(actionYaml).toContain('dashboard-url:')
    expect(inputSource).toContain("'allow-long-run-handoff'")
    expect(inputSource).toContain('ALLOW_LONG_RUN_HANDOFF')
  })

  it('declares and plumbs every supported Product processing mode', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )

    expect(actionYaml).toContain('processing-mode:')
    expect(actionYaml).toContain('individual, individual_cc,')
    expect(actionYaml).toContain('and group_cc')
    expect(inputSource).toContain("'processing-mode'")
    expect(inputSource).toContain("'INPUT_PROCESSING_MODE'")
    expect(inputSource).toContain("'PROCESSING_MODE'")
  })

  it('does not expose or accept the internal experiment control', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )
    const inputSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'input.ts'),
      'utf8'
    )
    const serviceSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'service.ts'),
      'utf8'
    )
    const runtimeSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'common', 'core', 'index.ts'),
      'utf8'
    )

    expect(actionYaml).not.toContain('experiment:')
    expect(inputSource).not.toContain('getExperiment')
    expect(inputSource).not.toContain('INPUT_EXPERIMENT')
    expect(inputSource).not.toContain('APPSECAI_EXPERIMENT')
    expect(serviceSource).not.toContain('getExperiment')
    expect(runtimeSource).not.toContain("formData.append('experiment'")
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
