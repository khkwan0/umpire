import fs from 'node:fs'
import path from 'node:path'

export interface DiscordConfig {
  webhookUrl: string
  username: string
}

const empty: DiscordConfig = { webhookUrl: '', username: 'UMPIRE' }

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
    if (!parsed.hostname.endsWith('discord.com') && !parsed.hostname.endsWith('discordapp.com')) {
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
  if (typeof row.webhookUrl !== 'string') throw new Error('webhookUrl must be a string')
  const webhookUrl = row.webhookUrl.trim()
  const err = validateWebhookUrl(webhookUrl)
  if (err) throw new Error(err)
  const username = typeof row.username === 'string' && row.username.trim() ? row.username.trim() : 'UMPIRE'
  return { webhookUrl, username }
}

export function isConfigured(config: DiscordConfig): boolean {
  return Boolean(config.webhookUrl) && validateWebhookUrl(config.webhookUrl) === null
}

export function readConfig(): DiscordConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return { ...empty }
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[notify:discord] failed to read config file', err)
    return { ...empty }
  }
}

export function writeConfig(config: DiscordConfig): DiscordConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}
