// __tests__/action-yml.test.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.

import fs from 'fs'
import path from 'path'

describe('action.yml', () => {
  it('passes the multi-file input through to the Node runtime', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )

    expect(actionYaml).toContain('files:')
    expect(actionYaml).toContain('INPUT_FILES: ${{ inputs.files }}')
  })

  it('does not expose dev-only llm-profile controls in public action metadata', () => {
    const actionYaml = fs.readFileSync(
      path.join(process.cwd(), 'action.yml'),
      'utf8'
    )

    expect(actionYaml).not.toContain('llm-profile:')
    expect(actionYaml).not.toContain('prod, mock, cheap, balanced, final')
    expect(actionYaml).not.toContain('INPUT_LLM_PROFILE:')
    expect(actionYaml).not.toContain('APPSECAI_LLM_PROFILE')
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
