#!/usr/bin/env node
export const isConventionalTitle = (title) => {
  if (typeof title !== 'string') {
    return false
  }

  return /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._-]+\))?!?: .+/.test(
    title.trim()
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const title = process.argv.slice(2).join(' ')
  if (!isConventionalTitle(title)) {
    console.error('PR title must use Conventional Commits format.')
    process.exit(1)
  }
}
