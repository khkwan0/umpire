import fs from 'node:fs'
import path from 'node:path'
import {
  buildTargetConfigView as buildGenericTargetConfigView,
  parseUseCustomOverride,
  type NotifierTargetConfigView,
} from '../shared/targetConfig.js'

export interface SlackConfig {
  webhookUrl: string
  username: string
}

export interface SlackTargetOverride {
  useCustom: boolean
  webhookUrl?: string
  username?: string
}

export type SlackTargetConfigView = NotifierTargetConfigView<SlackConfig>

const empty: SlackConfig = {webhookUrl: '', username: 'UMPIRE'}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'slack.json')
}

function validateWebhookUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return 'webhookUrl must be https'
    if (!parsed.hostname.endsWith('slack.com')) {
      return 'webhookUrl must be a Slack URL'
    }
    return null
  } catch {
    return 'webhookUrl is invalid'
  }
}

export function normalizeConfig(input: unknown): SlackConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { webhookUrl, username? }')
  }
  const row = input as Record<string, unknown>
  if (typeof row.webhookUrl !== 'string') {
    throw new Error('webhookUrl must be a string')
  }
  const webhookUrl = row.webhookUrl.trim()
  const err = validateWebhookUrl(webhookUrl)
  if (err) throw new Error(err)
  const username =
    typeof row.username === 'string' && row.username.trim()
      ? row.username.trim()
      : 'UMPIRE'
  return {webhookUrl, username}
}

export function isConfigured(config: SlackConfig): boolean {
  return (
    Boolean(config.webhookUrl) && validateWebhookUrl(config.webhookUrl) === null
  )
}

export function readDefaults(): SlackConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return {...empty}
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[notify:slack] failed to read config file', err)
    return {...empty}
  }
}

export function writeDefaults(config: SlackConfig): SlackConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function isFullSlackConfig(row: Record<string, unknown>): boolean {
  return typeof row.webhookUrl === 'string' && !('useCustom' in row)
}

export function parseStoredOverride(
  stored: unknown,
): SlackTargetOverride | null {
  return parseUseCustomOverride(
    stored,
    isFullSlackConfig,
    input => {
      const config = normalizeConfig(input)
      return {useCustom: true, ...config}
    },
    row => {
      const override: SlackTargetOverride = {useCustom: true}
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

export function mergeSlackConfig(
  defaults: SlackConfig,
  override: SlackTargetOverride | null,
): SlackConfig {
  if (!override?.useCustom) return {...defaults}
  return {
    webhookUrl: override.webhookUrl ?? defaults.webhookUrl,
    username: override.username ?? defaults.username,
  }
}

export function normalizeTargetOverride(input: unknown): SlackTargetOverride {
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

export function buildTargetConfigView(stored: unknown): SlackTargetConfigView {
  return buildGenericTargetConfigView(
    readDefaults,
    stored,
    parseStoredOverride,
    mergeSlackConfig,
  )
}

export function resolveSlackConfigForTarget(stored: unknown): SlackConfig {
  return buildTargetConfigView(stored).effective
}
