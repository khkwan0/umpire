import fs from 'node:fs'
import path from 'node:path'

export type EmailMode = 'sendmail' | 'smtp'

export interface EmailSmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

export interface EmailConfig {
  mode: EmailMode
  from: string
  to: string[]
  sendmailPath: string
  smtp: EmailSmtpConfig
}

const empty: EmailConfig = {
  mode: 'sendmail',
  from: '',
  to: [],
  sendmailPath: '',
  smtp: {
    host: '',
    port: 465,
    secure: true,
    username: '',
    password: '',
  },
}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'email.json')
}

function validateEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function normalizeConfig(input: unknown): EmailConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { mode, from, to, sendmailPath?, smtp? }')
  }
  const row = input as Record<string, unknown>
  const modeRaw = row.mode === undefined ? 'sendmail' : row.mode
  if (modeRaw !== 'sendmail' && modeRaw !== 'smtp') {
    throw new Error('mode must be "sendmail" or "smtp"')
  }
  if (typeof row.from !== 'string') throw new Error('from must be a string')
  if (!Array.isArray(row.to)) throw new Error('to must be an array of email addresses')
  const sendmailPath =
    typeof row.sendmailPath === 'string' ? row.sendmailPath.trim() : ''
  const smtpRaw =
    row.smtp && typeof row.smtp === 'object' && !Array.isArray(row.smtp)
      ? (row.smtp as Record<string, unknown>)
      : {}
  const smtp: EmailSmtpConfig = {
    host: typeof smtpRaw.host === 'string' ? smtpRaw.host.trim() : '',
    port:
      typeof smtpRaw.port === 'number' && Number.isInteger(smtpRaw.port)
        ? smtpRaw.port
        : 465,
    secure: smtpRaw.secure !== false,
    username: typeof smtpRaw.username === 'string' ? smtpRaw.username.trim() : '',
    password: typeof smtpRaw.password === 'string' ? smtpRaw.password : '',
  }
  if (modeRaw === 'smtp') {
    if (!smtp.host) throw new Error('smtp.host is required for smtp mode')
    if (smtp.port < 1 || smtp.port > 65535) {
      throw new Error('smtp.port must be 1..65535')
    }
    if (!smtp.username) throw new Error('smtp.username is required for smtp mode')
    if (!smtp.password) throw new Error('smtp.password is required for smtp mode')
  }
  const from = row.from.trim()
  const to = row.to
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
  if (from && !validateEmailAddress(from)) throw new Error('from is invalid')
  for (const addr of to) {
    if (!validateEmailAddress(addr)) throw new Error(`invalid recipient: ${addr}`)
  }
  return { mode: modeRaw, from, to, sendmailPath, smtp }
}

export function isConfigured(config: EmailConfig): boolean {
  if (!config.from || config.to.length === 0) return false
  if (config.mode === 'smtp') {
    return Boolean(
      config.smtp.host &&
        config.smtp.port &&
        config.smtp.username &&
        config.smtp.password,
    )
  }
  return true
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
