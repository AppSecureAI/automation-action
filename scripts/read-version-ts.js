#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const versionFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'src', 'version.ts')

const content = fs.readFileSync(versionFile, 'utf8')
const match = content.match(/export\s+const\s+VERSION\s*=\s*['"]([^'"]+)['"]/)

if (!match) {
  throw new Error(`Unable to find VERSION export in ${versionFile}`)
}

console.log(match[1])
