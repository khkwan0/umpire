import fs from 'node:fs'
import path from 'node:path'

export interface KeywordBodyConfig {
  keyword: string
  caseSensitive: boolean
}

const empty: KeywordBodyConfig = {
  keyword: 'ok',
  caseSensitive: false,
}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'keyword-body-check.json')
}

export function normalizeKeywordBodyConfig(input: unknown): KeywordBodyConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { keyword?, caseSensitive? }')
  }
  const row = input as Record<string, unknown>
  const keyword = String(row.keyword ?? '').trim()
  if (!keyword) throw new Error('keyword is required')
  const caseSensitive = Boolean(row.caseSensitive)
  return { keyword, caseSensitive }
}

export function readKeywordBodyConfig(): KeywordBodyConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return { ...empty }
  try {
    return normalizeKeywordBodyConfig(
      JSON.parse(fs.readFileSync(file, 'utf8')) as unknown,
    )
  } catch (err) {
    console.error('[check:keyword-body] failed to read config file', err)
    return { ...empty }
  }
}

export function writeKeywordBodyConfig(
  config: KeywordBodyConfig,
): KeywordBodyConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}
