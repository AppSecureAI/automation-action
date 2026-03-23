import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

describe('publish public release workflow', () => {
  it('extracts src/version.ts version via shared parity script', () => {
    const workflowPath = path.join(
      ROOT_DIR,
      '.github',
      'workflows',
      'publish-public-release.yml'
    )
    const content = fs.readFileSync(workflowPath, 'utf8')

    expect(content).toContain('name: Publish Public Release')
    expect(content).toContain(
      './scripts/check-version-parity.sh --output "$GITHUB_OUTPUT"'
    )
    expect(content).not.toContain('const fs=require("node:fs")')
    expect(content).not.toContain('\n              VERSION_TS="$(node -e')
    expect(content).not.toContain('\n              VERSION_TS="$(grep -m1 -oP')
  })
})
