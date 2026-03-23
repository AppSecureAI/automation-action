import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

describe('ci workflow', () => {
  it('runs mirror health checks on push and pull requests', () => {
    const workflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml')
    const content = fs.readFileSync(workflowPath, 'utf8')

    expect(content).toContain('name: Continuous Integration')
    expect(content).toContain('pull_request:')
    expect(content).toContain('push:')
    expect(content).toContain('branches:')
    expect(content).toContain('- main')
    expect(content).toContain('Verify generated version file is up to date')
    expect(content).toContain('Enforce version parity')
    expect(content).toContain('./scripts/check-version-parity.sh')
    expect(content).toContain('Validate mirror sync dry-run')
    expect(content).toContain('./scripts/publish-public.sh --dry-run --verbose')
    expect(content).not.toContain('Verify version.ts is up to date')
  })
})
