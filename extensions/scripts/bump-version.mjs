import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')
const wxtPath = join(root, 'wxt.config.ts')

/** @type {'patch' | 'minor' | 'major'} */
const level = process.argv.includes('--major')
  ? 'major'
  : process.argv.includes('--minor')
    ? 'minor'
    : 'patch'

const dryRun = process.argv.includes('--dry-run')

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
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

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = pkg.version
const next = bump(current, level)

if (dryRun) {
  console.log(`${current} → ${next} (${level})`)
  process.exit(0)
}

pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const wxt = readFileSync(wxtPath, 'utf8')
const updatedWxt = wxt.replace(
  /version:\s*['"][\d.]+['"]/,
  `version: '${next}'`,
)
if (updatedWxt === wxt) {
  throw new Error('Could not update version in wxt.config.ts')
}
writeFileSync(wxtPath, updatedWxt)

console.log(`version ${current} → ${next} (${level})`)
