import fs from 'node:fs'
import path from 'node:path'

export interface EmailConfig {
  from: string
  to: string[]
}

const empty: EmailConfig = { from: '', to: [] }

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'email.json')
}

function validateEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function normalizeConfig(input: unknown): EmailConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { from, to }')
  }
  const row = input as Record<string, unknown>
  if (typeof row.from !== 'string') throw new Error('from must be a string')
  if (!Array.isArray(row.to)) throw new Error('to must be an array of email addresses')
  const from = row.from.trim()
  const to = row.to
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
  if (from && !validateEmailAddress(from)) throw new Error('from is invalid')
  for (const addr of to) {
    if (!validateEmailAddress(addr)) throw new Error(`invalid recipient: ${addr}`)
  }
  return { from, to }
}

export function isConfigured(config: EmailConfig): boolean {
  return Boolean(config.from) && config.to.length > 0
}

export function readConfig(): EmailConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return { ...empty }
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[notify:email] failed to read config file', err)
    return { ...empty }
  }
}

export function writeConfig(config: EmailConfig): EmailConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}
