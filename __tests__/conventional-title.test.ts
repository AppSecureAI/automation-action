import { isConventionalTitle } from '../scripts/validate-conventional-title.js'

describe('conventional title validation', () => {
  it('accepts valid conventional commit style titles', () => {
    expect(isConventionalTitle('feat: add changelog automation')).toBe(true)
    expect(isConventionalTitle('fix(ci): validate PR titles')).toBe(true)
    expect(
      isConventionalTitle('chore(release)!: drop legacy release path')
    ).toBe(true)
  })

  it('rejects non-conventional titles', () => {
    expect(isConventionalTitle('Update readme')).toBe(false)
    expect(isConventionalTitle('hotfix release')).toBe(false)
    expect(isConventionalTitle('')).toBe(false)
  })
})
