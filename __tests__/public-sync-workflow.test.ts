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
    expect(content).toContain('Determine version tag')
    expect(content).toContain('Extract source versions for parity logging')
    expect(content).toContain('Enforce mirror-only release policy')
    expect(content).toContain(
      'Manual publish requires a SemVer tag input (for example: v1.0.9).'
    )
    expect(content).toContain(
      './scripts/check-version-parity.sh --output "$GITHUB_OUTPUT"'
    )
    expect(content).toContain(
      'AUTOMATION_ACTION_TOKEN || secrets.PUBLIC_REPO_TOKEN'
    )
    expect(content).toContain('Validate mirror repository access')
    expect(content).toContain(
      "gh api repos/AppSecureAI/automation-action --jq '.permissions.push'"
    )
    expect(content).toContain('Run publish script')
    expect(content).toContain('Verify mirrored version, tags, and dist parity')
    expect(content).toContain('diff -qr "${GITHUB_WORKSPACE}/dist" ./dist')
    expect(content).toContain(
      'Mirror parity failed: expected public package.json'
    )
    expect(content).toContain('Create or update public GitHub release')
    expect(content).toContain('gh release create "$TAG"')
    expect(content).toContain('gh release edit "$TAG"')
    expect(content).toContain('### Source Version Parity')
    expect(content).toContain('### Mirror Policy')
    expect(content).toContain('### Mirror Parity Verification')
    expect(content).toContain(
      '| src/version.ts | ${{ steps.version.outputs.version_ts }} |'
    )
  })
})
