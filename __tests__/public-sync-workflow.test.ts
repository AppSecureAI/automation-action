import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

describe('public sync workflow', () => {
  it('publishes automatically on release and creates a public release', () => {
    const workflowPath = path.join(
      ROOT_DIR,
      '.github',
      'workflows',
      'publish-public-release.yml'
    )
    const content = fs.readFileSync(workflowPath, 'utf8')

    expect(content).toContain('name: Publish Public Release')
    expect(content).toContain('release:')
    expect(content).toContain('types: [published]')
    expect(content).toContain('Determine publish mode')
    expect(content).toContain('should_publish=true')
    expect(content).toContain(
      'AUTOMATION_ACTION_TOKEN || secrets.PUBLIC_REPO_TOKEN'
    )
    expect(content).toContain('Run publish script')
    expect(content).toContain('Create or update public GitHub release')
    expect(content).toContain('gh release create "$TAG"')
    expect(content).toContain('gh release edit "$TAG"')
  })
})
