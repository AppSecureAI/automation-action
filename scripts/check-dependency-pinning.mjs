#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

function exists(filePath) {
  return fs.existsSync(path.join(root, filePath))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(root, filePath), 'utf8'))
}

function walk(dir) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(rel)
    return [rel]
  })
}

if (!exists('package.json')) {
  failures.push('package.json is missing')
}

if (!exists('package-lock.json')) {
  failures.push(
    'package-lock.json is required so npm installs are reproducible'
  )
}

if (exists('package.json') && exists('package-lock.json')) {
  const pkg = readJson('package.json')
  const lock = readJson('package-lock.json')
  const declared = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies
  }

  if (!lock.packages || !lock.packages['']) {
    failures.push(
      'package-lock.json must be npm lockfile v2/v3 with a root package entry'
    )
  }

  for (const name of Object.keys(declared).sort()) {
    if (!lock.packages?.[`node_modules/${name}`]) {
      failures.push(
        `${name} is declared in package.json but missing from package-lock.json`
      )
    }
  }
}

for (const file of walk('.github/workflows').filter((name) =>
  /\.(ya?ml)$/.test(name)
)) {
  const content = fs.readFileSync(path.join(root, file), 'utf8')
  const plainNpmInstall = content.match(/\bnpm\s+install\b(?!\s+-g)/)
  if (plainNpmInstall) {
    failures.push(
      `${file} uses npm install; use npm ci for lockfile-respecting installs`
    )
  }
  const mutableAction = content.match(/uses:\s*[^#\n]+@(main|master)\b/)
  if (mutableAction) {
    failures.push(
      `${file} uses a mutable GitHub Action ref: ${mutableAction[0].trim()}`
    )
  }
  const unpinnedPipInstall = content.match(
    /\bpip\s+install\s+(?!.*==)(?!.*-r\b)[^\n]+/
  )
  if (unpinnedPipInstall) {
    failures.push(
      `${file} has an unpinned direct pip install: ${unpinnedPipInstall[0].trim()}`
    )
  }
}

if (failures.length) {
  console.error('Dependency pinning audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Dependency pinning audit passed')
