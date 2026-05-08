// __tests__/action-yml.test.ts
// Copyright (c) 2026 AppSecAI, Inc. All rights reserved.

import fs from 'fs'
import path from 'path'

describe('action.yml', () => {
  it('passes the multi-file input through to the Node runtime', () => {
    const actionYaml = fs.readFileSync(path.join(process.cwd(), 'action.yml'), 'utf8')

    expect(actionYaml).toContain('files:')
    expect(actionYaml).toContain('INPUT_FILES: ${{ inputs.files }}')
  })
})
