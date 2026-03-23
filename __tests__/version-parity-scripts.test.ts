import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

const runNodeScript = (scriptPath: string, args: string[] = []): string => {
  return execFileSync('node', [scriptPath, ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  }).trim()
}

describe('version parity scripts', () => {
  it('reads VERSION from src/version.ts', () => {
    const version = runNodeScript('scripts/read-version-ts.js')
    expect(version).toMatch(/^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/)
  })

  it('fails when VERSION export is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-parse-'))
    const badVersionFile = path.join(tmpDir, 'version.ts')
    fs.writeFileSync(badVersionFile, "export const CLIENT_VERSION = '1.2.3'\n")

    expect(() =>
      runNodeScript('scripts/read-version-ts.js', [badVersionFile])
    ).toThrow()
  })

  it('passes parity check for current repository state', () => {
    const output = execFileSync('bash', ['scripts/check-version-parity.sh'], {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    })
    expect(output).toContain('Version parity check passed')
  })

  it('fails parity check when tag does not match source versions', () => {
    expect(() =>
      execFileSync(
        'bash',
        ['scripts/check-version-parity.sh', '--tag', 'v0.0.0'],
        {
          cwd: ROOT_DIR,
          encoding: 'utf8'
        }
      )
    ).toThrow()
  })
})
