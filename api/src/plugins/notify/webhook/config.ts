import fs from 'node:fs'
import path from 'node:path'
import {
  buildTargetConfigView as buildGenericTargetConfigView,
  parseUseCustomOverride,
  type NotifierTargetConfigView,
} from '../shared/targetConfig.js'

export const WEBHOOK_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const

export type WebhookMethod = (typeof WEBHOOK_METHODS)[number]

/** Methods that send AlertEvent as a JSON body. Others put it on the query string. */
export const WEBHOOK_BODY_METHODS: ReadonlySet<WebhookMethod> = new Set([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
])

export interface WebhookConfig {
  url: string
  method: WebhookMethod
  headers: Record<string, string>
}

export interface WebhookTargetOverride {
  useCustom: boolean
  url?: string
  method?: WebhookMethod
  headers?: Record<string, string>
}

export type WebhookTargetConfigView = NotifierTargetConfigView<WebhookConfig>

const empty: WebhookConfig = {url: '', method: 'POST', headers: {}}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'webhook.json')
}

export function parseHeaders(input: unknown): Record<string, string> {
  if (input === undefined || input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('headers must be a JSON object of string values')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== 'string' || !k.trim()) {
      throw new Error('headers keys must be non-empty strings')
    }
    if (typeof v !== 'string') {
      throw new Error('headers values must be strings')
    }
    out[k] = v
  }
  return out
}

export function parseMethod(input: unknown): WebhookMethod {
  if (input === undefined || input === null || input === '') return 'POST'
  if (typeof input !== 'string') {
    throw new Error(`method must be one of ${WEBHOOK_METHODS.join(', ')}`)
  }
  const method = input.trim().toUpperCase()
  if (!(WEBHOOK_METHODS as readonly string[]).includes(method)) {
    throw new Error(`method must be one of ${WEBHOOK_METHODS.join(', ')}`)
  }
  return method as WebhookMethod
}

/** Empty string is allowed (not ready). Non-empty must be http(s). */
export function validateUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'url must be http(s)'
    }
    return null
  } catch {
    return 'url is invalid'
  }
}

export function normalizeConfig(input: unknown): WebhookConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { url, method?, headers? }')
  }
  const row = input as Record<string, unknown>
  if (typeof row.url !== 'string') {
    throw new Error('url must be a string')
  }
  const url = row.url.trim()
  const urlError = validateUrl(url)
  if (urlError) throw new Error(urlError)
  return {
    url,
    method: parseMethod(row.method),
    headers: parseHeaders(row.headers),
  }
}

export function isConfigured(config: WebhookConfig): boolean {
  return Boolean(config.url) && validateUrl(config.url) === null
}

export function readDefaults(): WebhookConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return {...empty, headers: {}}
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return normalizeConfig(raw)
  } catch (err) {
    console.error('[notify:webhook] failed to read config file', err)
    return {...empty, headers: {}}
  }
}

export function writeDefaults(config: WebhookConfig): WebhookConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  const next: WebhookConfig = {
    url: config.url,
    method: config.method,
    headers: config.headers,
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function isFullWebhookConfig(row: Record<string, unknown>): boolean {
  return typeof row.url === 'string' && !('useCustom' in row)
}

export function parseStoredOverride(
  stored: unknown,
): WebhookTargetOverride | null {
  return parseUseCustomOverride(
    stored,
    isFullWebhookConfig,
    input => {
      const config = normalizeConfig(input)
      return {
        useCustom: true,
        url: config.url,
        method: config.method,
        headers: config.headers,
      }
    },
    row => {
      const override: WebhookTargetOverride = {useCustom: true}
      if (row.url !== undefined) {
        const url = String(row.url).trim()
        const urlError = validateUrl(url)
        if (urlError) throw new Error(urlError)
        override.url = url
      }
      if (row.method !== undefined) override.method = parseMethod(row.method)
      if (row.headers !== undefined)
        override.headers = parseHeaders(row.headers)
      return override
    },
  )
}

export function mergeWebhookConfig(
  defaults: WebhookConfig,
  override: WebhookTargetOverride | null,
): WebhookConfig {
  if (!override?.useCustom) {
    return {...defaults, headers: {...defaults.headers}}
  }
  return {
    url: override.url ?? defaults.url,
    method: override.method ?? defaults.method,
    headers: override.headers ?? {...defaults.headers},
  }
}

export function normalizeTargetOverride(input: unknown): WebhookTargetOverride {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { useCustom: true, url?, method?, headers? }')
  }
  const row = input as Record<string, unknown>
  if (row.useCustom !== true) {
    throw new Error('useCustom must be true when saving a target override')
  }
  const config = normalizeConfig(input)
  return {
    useCustom: true,
    url: config.url,
    method: config.method,
    headers: config.headers,
  }
}

export function buildTargetConfigView(
  stored: unknown,
): WebhookTargetConfigView {
  return buildGenericTargetConfigView(
    readDefaults,
    stored,
    parseStoredOverride,
    mergeWebhookConfig,
  )
}

export function resolveWebhookConfigForTarget(stored: unknown): WebhookConfig {
  return buildTargetConfigView(stored).effective
}

/**
 * One-time copy of legacy WEBHOOK_URL / WEBHOOK_HEADERS into the sidecar
 * if the file does not exist yet. After that, env is ignored.
 */
export function seedFromEnvIfNeeded(): void {
  const file = configPath()
  if (fs.existsSync(file)) return
  const url = (process.env.WEBHOOK_URL ?? '').trim()
  if (!url) return
  try {
    const headers = parseHeaders(
      process.env.WEBHOOK_HEADERS
        ? (JSON.parse(process.env.WEBHOOK_HEADERS) as unknown)
        : {},
    )
    const config = normalizeConfig({url, method: 'POST', headers})
    writeDefaults(config)
    console.warn(
      '[notify:webhook] copied WEBHOOK_URL into webhook.json; configure in the UI going forward',
    )
  } catch (err) {
    console.warn(
      '[notify:webhook] ignored WEBHOOK_* env (invalid); set the URL in the UI',
      err instanceof Error ? err.message : err,
    )
  }
}
