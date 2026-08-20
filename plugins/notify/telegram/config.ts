import fs from 'node:fs'
import path from 'node:path'
import {
  buildTargetConfigView as buildGenericTargetConfigView,
  parseUseCustomOverride,
  type NotifierTargetConfigView,
} from '../shared/targetConfig.js'

export interface TelegramConfig {
  botToken: string
  chatId: string
  threadId: string
}

export interface TelegramTargetOverride {
  useCustom: boolean
  botToken?: string
  chatId?: string
  threadId?: string
}

export type TelegramTargetConfigView = NotifierTargetConfigView<TelegramConfig>

const empty: TelegramConfig = {botToken: '', chatId: '', threadId: ''}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'telegram.json')
}

export function normalizeConfig(input: unknown): TelegramConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { botToken, chatId, threadId? }')
  }
  const row = input as Record<string, unknown>
  if (typeof row.botToken !== 'string')
    throw new Error('botToken must be a string')
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

export function readDefaults(): TelegramConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return {...empty}
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[notify:telegram] failed to read config file', err)
    return {...empty}
  }
}

export function writeDefaults(config: TelegramConfig): TelegramConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function isFullTelegramConfig(row: Record<string, unknown>): boolean {
  return typeof row.botToken === 'string' && !('useCustom' in row)
}

export function parseStoredOverride(
  stored: unknown,
): TelegramTargetOverride | null {
  return parseUseCustomOverride(
    stored,
    isFullTelegramConfig,
    input => {
      const config = normalizeConfig(input)
      return {useCustom: true, ...config}
    },
    row => {
      const override: TelegramTargetOverride = {useCustom: true}
      if (row.botToken !== undefined)
        override.botToken = String(row.botToken).trim()
      if (row.chatId !== undefined) override.chatId = String(row.chatId).trim()
      if (row.threadId !== undefined)
        override.threadId = String(row.threadId).trim()
      return override
    },
  )
}

export function mergeTelegramConfig(
  defaults: TelegramConfig,
  override: TelegramTargetOverride | null,
): TelegramConfig {
  if (!override?.useCustom) return {...defaults}
  return {
    botToken: override.botToken ?? defaults.botToken,
    chatId: override.chatId ?? defaults.chatId,
    threadId: override.threadId ?? defaults.threadId,
  }
}

export function normalizeTargetOverride(
  input: unknown,
): TelegramTargetOverride {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(
      'body must be { useCustom: true, botToken?, chatId?, threadId? }',
    )
  }
  const row = input as Record<string, unknown>
  if (row.useCustom !== true) {
    throw new Error('useCustom must be true when saving a target override')
  }
  const config = normalizeConfig(input)
  return {useCustom: true, ...config}
}

export function buildTargetConfigView(
  stored: unknown,
): TelegramTargetConfigView {
  return buildGenericTargetConfigView(
    readDefaults,
    stored,
    parseStoredOverride,
    mergeTelegramConfig,
  )
}

export function resolveTelegramConfigForTarget(
  stored: unknown,
): TelegramConfig {
  return buildTargetConfigView(stored).effective
}
