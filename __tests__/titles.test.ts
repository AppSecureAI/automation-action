import { jest } from '@jest/globals'

const debugMock = jest.fn()
const warningMock = jest.fn()
const issuesGetMock =
  jest.fn<() => Promise<{ data: { title?: string | null } }>>()
const getOctokitMock = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  debug: debugMock,
  warning: warningMock
}))

jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: getOctokitMock
}))

const { fetchPrTitles, parsePrUrl } = await import('../src/titles')

describe('titles.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    getOctokitMock.mockReturnValue({
      rest: {
        issues: {
          get: issuesGetMock
        }
      }
    })
  })

  it('parses pull request and issue URLs', () => {
    expect(
      parsePrUrl('https://github.com/AppSecureAI/Product/pull/5412')
    ).toEqual({
      owner: 'AppSecureAI',
      repo: 'Product',
      number: 5412
    })

    expect(
      parsePrUrl('https://github.com/AppSecureAI/Product/issues/5406')
    ).toEqual({
      owner: 'AppSecureAI',
      repo: 'Product',
      number: 5406
    })
  })

  it('returns null for non-GitHub or incomplete URLs', () => {
    expect(parsePrUrl('https://example.com/AppSecureAI/Product/pull/1')).toBe(
      null
    )
    expect(parsePrUrl('https://github.com/AppSecureAI/Product/pulls/1')).toBe(
      null
    )
    expect(parsePrUrl('not a url')).toBe(null)
  })

  it('returns an empty map without URLs or token', async () => {
    await expect(fetchPrTitles([], 'ghs_test')).resolves.toEqual(new Map())
    await expect(
      fetchPrTitles(['https://github.com/AppSecureAI/Product/pull/1'], '')
    ).resolves.toEqual(new Map())

    expect(getOctokitMock).not.toHaveBeenCalled()
  })

  it('fetches titles and skips invalid URLs', async () => {
    issuesGetMock.mockResolvedValue({
      data: {
        title: 'Fix run summary'
      }
    })

    const validUrl = 'https://github.com/AppSecureAI/Product/pull/123'
    const result = await fetchPrTitles([validUrl, 'not a url'], 'ghs_test')

    expect(result).toEqual(new Map([[validUrl, 'Fix run summary']]))
    expect(issuesGetMock).toHaveBeenCalledWith({
      owner: 'AppSecureAI',
      repo: 'Product',
      issue_number: 123
    })
  })

  it('logs debug and continues when a title lookup fails', async () => {
    issuesGetMock.mockRejectedValue(new Error('rate limited'))

    const result = await fetchPrTitles(
      ['https://github.com/AppSecureAI/Product/issues/123'],
      'ghs_test'
    )

    expect(result).toEqual(new Map())
    expect(debugMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch title')
    )
  })

  it('warns and returns an empty map when the GitHub client cannot initialize', async () => {
    getOctokitMock.mockImplementation(() => {
      throw new Error('bad token')
    })

    const result = await fetchPrTitles(
      ['https://github.com/AppSecureAI/Product/issues/123'],
      'ghs_test'
    )

    expect(result).toEqual(new Map())
    expect(warningMock).toHaveBeenCalledWith(
      expect.stringContaining('Error initializing GitHub client')
    )
  })
})
