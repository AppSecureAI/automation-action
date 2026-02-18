import * as core from '@actions/core'
import { getOctokit } from '@actions/github'

/**
 * Extract owner, repo, and number from a GitHub PR/Issue URL
 */
export function parsePrUrl(url: string): {
  owner: string
  repo: string
  number: number
} | null {
  // Matches https://github.com/owner/repo/pull/123 or .../issues/123
  const regex = /github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)$/
  const match = url.match(regex)

  if (!match) {
    return null
  }

  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10)
  }
}

/**
 * Fetch titles for a list of PR/Issue URLs
 * @param urls List of PR or Issue URLs
 * @param token GitHub token
 * @returns Map of URL to Title
 */
export async function fetchPrTitles(
  urls: string[],
  token: string
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()

  if (!urls.length || !token) {
    return titles
  }

  try {
    const octokit = getOctokit(token)

    // Process in parallel but handle errors individually
    const promises = urls.map(async (url) => {
      const parsed = parsePrUrl(url)
      if (!parsed) {
        return
      }

      try {
        const { data } = await octokit.rest.issues.get({
          owner: parsed.owner,
          repo: parsed.repo,
          issue_number: parsed.number
        })

        if (data.title) {
          titles.set(url, data.title)
        }
      } catch (error) {
        core.debug(`Failed to fetch title for ${url}: ${error}`)
      }
    })

    await Promise.all(promises)
  } catch (error) {
    core.warning(
      `Error initializing GitHub client for title fetching: ${error}`
    )
  }

  return titles
}
