import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

function versionFromPackage(path: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
      name?: unknown
      version?: unknown
    }
    if (pkg.name === 'umpire-api' && typeof pkg.version === 'string') {
      return pkg.version
    }
  } catch {
    return null
  }
  return null
}

/** Resolve umpire-api version from package.json (cwd or walk from this file). */
export function readApiVersion(): string {
  const fromEnv = process.env.UMPIRE_API_VERSION?.trim()
  if (fromEnv) return fromEnv

  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))]
  for (const start of starts) {
    let dir = start
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, 'package.json')
      if (existsSync(candidate)) {
        const version = versionFromPackage(candidate)
        if (version) return version
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return 'unknown'
}

export const API_VERSION = readApiVersion()
