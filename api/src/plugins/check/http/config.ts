import fs from 'node:fs'
import path from 'node:path'

export const HTTP_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'TRACE',
  'CONNECT',
] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface HttpCheckConfig {
  method: HttpMethod
  headers: Record<string, string>
  body: string
}

const empty: HttpCheckConfig = {
  method: 'GET',
  headers: {},
  body: '',
}

function configPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'http-check.json')
}

export function parseHeaders(input: unknown): Record<string, string> {
  if (input === undefined || input === null) return {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('headers must be a JSON object of string values')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!k.trim()) throw new Error('headers keys must be non-empty strings')
    if (typeof v !== 'string') throw new Error('headers values must be strings')
    out[k] = v
  }
  return out
}

function parseMethod(input: unknown): HttpMethod {
  if (input === undefined || input === null || input === '') return 'GET'
  if (typeof input !== 'string') {
    throw new Error(`method must be one of ${HTTP_METHODS.join(', ')}`)
  }
  const method = input.trim().toUpperCase()
  if (!(HTTP_METHODS as readonly string[]).includes(method)) {
    throw new Error(`method must be one of ${HTTP_METHODS.join(', ')}`)
  }
  return method as HttpMethod
}

export function normalizeConfig(input: unknown): HttpCheckConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { method?, headers?, body? }')
  }
  const row = input as Record<string, unknown>
  const body =
    row.body === undefined || row.body === null ? '' : String(row.body)
  return {
    method: parseMethod(row.method),
    headers: parseHeaders(row.headers),
    body,
  }
}

export function readConfig(): HttpCheckConfig {
  const file = configPath()
  if (!fs.existsSync(file)) return { ...empty, headers: {} }
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[check:http] failed to read config file', err)
    return { ...empty, headers: {} }
  }
}

export function writeConfig(config: HttpCheckConfig): HttpCheckConfig {
  const file = configPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}
