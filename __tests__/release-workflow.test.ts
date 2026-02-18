import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

describe('release workflow', () => {
  it('updates floating tags and creates releases from semver tags', () => {
    const workflowPath = path.join(
      ROOT_DIR,
      '.github',
      'workflows',
      'release.yml'
    )
    const content = fs.readFileSync(workflowPath, 'utf8')

    expect(content).toContain('name: Release')
    expect(content).toContain('tags:')
    expect(content).toContain("- 'v*'")
    expect(content).toContain('Update floating tags')
    expect(content).toContain('Generate changelog')
    expect(content).toContain('npm run changelog')
    expect(content).toContain('Commit and push changelog')
    expect(content).toContain('git tag -fa "${{ steps.meta.outputs.major }}"')
    expect(content).toContain('git tag -fa "${{ steps.meta.outputs.minor }}"')
    expect(content).toContain('softprops/action-gh-release@v2')
  })
})
