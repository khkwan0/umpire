#!/usr/bin/env node
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {'patch' | 'minor' | 'major'} */
const level = process.argv.includes('--major')
  ? 'major'
  : process.argv.includes('--minor')
    ? 'minor'
    : 'patch'

const dryRun = process.argv.includes('--dry-run')
const wantApi = process.argv.includes('--api')
const wantWeb = process.argv.includes('--web')
const targets = {
  api: wantApi || (!wantApi && !wantWeb),
  web: wantWeb || (!wantApi && !wantWeb),
}

const AREAS = {
  api: {
    pkg: 'api/package.json',
    lock: 'api/package-lock.json',
    extraPkg: ['agent/package.json'],
  },
  web: {
    pkg: 'web/package.json',
    lock: 'web/package-lock.json',
    extraPkg: [],
  },
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim())
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

function readPkgVersion(rel) {
  const pkg = JSON.parse(readFileSync(join(root, rel), 'utf8'))
  return String(pkg.version)
}

function writeJson(rel, mutate) {
  const full = join(root, rel)
  const data = JSON.parse(readFileSync(full, 'utf8'))
  mutate(data)
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`)
}

function applyArea(name) {
  const spec = AREAS[name]
  const current = readPkgVersion(spec.pkg)
  const next = bump(current, level)
  if (!dryRun) {
    writeJson(spec.pkg, pkg => {
      pkg.version = next
    })
    if (spec.lock && existsSync(join(root, spec.lock))) {
      writeJson(spec.lock, lock => {
        lock.version = next
        if (lock.packages?.['']) lock.packages[''].version = next
      })
    }
    for (const extra of spec.extraPkg) {
      if (!existsSync(join(root, extra))) continue
      writeJson(extra, pkg => {
        pkg.version = next
      })
    }
  }
  return {name, current, next}
}

const results = []
if (targets.api) results.push(applyArea('api'))
if (targets.web) results.push(applyArea('web'))

for (const r of results) {
  console.log(`${r.name} ${r.current} → ${r.next} (${level})`)
}
