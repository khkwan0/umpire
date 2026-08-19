import fs from 'node:fs'
import path from 'node:path'

export interface TelegramConfig {
  botToken: string
  chatId: string
  threadId: string
}

const empty: TelegramConfig = { botToken: '', chatId: '', threadId: '' }

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'telegram.json')
}

export function normalizeConfig(input: unknown): TelegramConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { botToken, chatId, threadId? }')
  }
  const row = input as Record<string, unknown>
  if (typeof row.botToken !== 'string') throw new Error('botToken must be a string')
  if (typeof row.chatId !== 'string') throw new Error('chatId must be a string')
  if (row.threadId !== undefined && typeof row.threadId !== 'string') {
    throw new Error('threadId must be a string')
  }
  return {
    botToken: row.botToken.trim(),
    chatId: row.chatId.trim(),
    threadId: typeof row.threadId === 'string' ? row.threadId.trim() : '',
  }
}

export function isConfigured(config: TelegramConfig): boolean {
  return Boolean(config.botToken) && Boolean(config.chatId)
}

export function readConfig(): TelegramConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return { ...empty }
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[notify:telegram] failed to read config file', err)
    return { ...empty }
  }
}

export function writeConfig(config: TelegramConfig): TelegramConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}
