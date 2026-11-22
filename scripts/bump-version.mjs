#!/usr/bin/env node
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versionPath = join(root, 'VERSION')

/** @type {'patch' | 'minor' | 'major'} */
const level = process.argv.includes('--major')
  ? 'major'
  : process.argv.includes('--minor')
    ? 'minor'
    : 'patch'

const dryRun = process.argv.includes('--dry-run')

const PKG_FILES = [
  'api/package.json',
  'web/package.json',
  'agent/package.json',
]

const LOCK_FILES = ['api/package-lock.json', 'web/package-lock.json']

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function bump(version, bumpLevel) {
  const parts = parseVersion(version)
  if (bumpLevel === 'major') {
    parts.major += 1
    parts.minor = 0
    parts.patch = 0
  } else if (bumpLevel === 'minor') {
    parts.minor += 1
    parts.patch = 0
  } else {
    parts.patch += 1
  }
  return `${parts.major}.${parts.minor}.${parts.patch}`
}

function readCurrent() {
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, 'utf8').trim()
  }
  const apiPkg = JSON.parse(
    readFileSync(join(root, 'api/package.json'), 'utf8'),
  )
  return String(apiPkg.version)
}

function writeJson(path, mutate) {
  const full = join(root, path)
  const data = JSON.parse(readFileSync(full, 'utf8'))
  mutate(data)
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`)
}

const current = readCurrent()
const next = bump(current, level)

if (dryRun) {
  console.log(`${current} → ${next} (${level})`)
  process.exit(0)
}

writeFileSync(versionPath, `${next}\n`)

for (const path of PKG_FILES) {
  writeJson(path, pkg => {
    pkg.version = next
  })
}

for (const path of LOCK_FILES) {
  if (!existsSync(join(root, path))) continue
  writeJson(path, lock => {
    lock.version = next
    if (lock.packages?.['']) {
      lock.packages[''].version = next
    }
  })
}

console.log(`version ${current} → ${next} (${level})`)
