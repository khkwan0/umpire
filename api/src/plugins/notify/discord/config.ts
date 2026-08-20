import fs from 'node:fs'
import path from 'node:path'
import {
  buildTargetConfigView as buildGenericTargetConfigView,
  parseUseCustomOverride,
  type NotifierTargetConfigView,
} from '../shared/targetConfig.js'

export interface DiscordConfig {
  webhookUrl: string
  username: string
}

export interface DiscordTargetOverride {
  useCustom: boolean
  webhookUrl?: string
  username?: string
}

export type DiscordTargetConfigView = NotifierTargetConfigView<DiscordConfig>

const empty: DiscordConfig = {webhookUrl: '', username: 'UMPIRE'}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'discord.json')
}

function validateWebhookUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return 'webhookUrl must be https'
    if (
      !parsed.hostname.endsWith('discord.com') &&
      !parsed.hostname.endsWith('discordapp.com')
    ) {
      return 'webhookUrl must be a Discord URL'
    }
    return null
  } catch {
    return 'webhookUrl is invalid'
  }
}

export function normalizeConfig(input: unknown): DiscordConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { webhookUrl, username? }')
  }
  const row = input as Record<string, unknown>
  if (typeof row.webhookUrl !== 'string')
    throw new Error('webhookUrl must be a string')
  const webhookUrl = row.webhookUrl.trim()
  const err = validateWebhookUrl(webhookUrl)
  if (err) throw new Error(err)
  const username =
    typeof row.username === 'string' && row.username.trim()
      ? row.username.trim()
      : 'UMPIRE'
  return {webhookUrl, username}
}

export function isConfigured(config: DiscordConfig): boolean {
  return (
    Boolean(config.webhookUrl) && validateWebhookUrl(config.webhookUrl) === null
  )
}

export function readDefaults(): DiscordConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return {...empty}
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[notify:discord] failed to read config file', err)
    return {...empty}
  }
}

export function writeDefaults(config: DiscordConfig): DiscordConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function isFullDiscordConfig(row: Record<string, unknown>): boolean {
  return typeof row.webhookUrl === 'string' && !('useCustom' in row)
}

export function parseStoredOverride(
  stored: unknown,
): DiscordTargetOverride | null {
  return parseUseCustomOverride(
    stored,
    isFullDiscordConfig,
    input => {
      const config = normalizeConfig(input)
      return {useCustom: true, ...config}
    },
    row => {
      const override: DiscordTargetOverride = {useCustom: true}
      if (row.webhookUrl !== undefined) {
        const webhookUrl = String(row.webhookUrl).trim()
        const err = validateWebhookUrl(webhookUrl)
        if (err) throw new Error(err)
        override.webhookUrl = webhookUrl
      }
      if (row.username !== undefined) {
        override.username =
          typeof row.username === 'string' && row.username.trim()
            ? row.username.trim()
            : 'UMPIRE'
      }
      return override
    },
  )
}

export function mergeDiscordConfig(
  defaults: DiscordConfig,
  override: DiscordTargetOverride | null,
): DiscordConfig {
  if (!override?.useCustom) return {...defaults}
  return {
    webhookUrl: override.webhookUrl ?? defaults.webhookUrl,
    username: override.username ?? defaults.username,
  }
}

export function normalizeTargetOverride(input: unknown): DiscordTargetOverride {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { useCustom: true, webhookUrl?, username? }')
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
): DiscordTargetConfigView {
  return buildGenericTargetConfigView(
    readDefaults,
    stored,
    parseStoredOverride,
    mergeDiscordConfig,
  )
}

export function resolveDiscordConfigForTarget(stored: unknown): DiscordConfig {
  return buildTargetConfigView(stored).effective
}
