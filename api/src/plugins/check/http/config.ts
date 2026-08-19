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
  acceptedStatusRanges: StatusRange[]
  maxLatencyMs: number | null
}

export const STATUS_RANGES = ['1xx', '2xx', '3xx', '4xx', '5xx'] as const
export type StatusRange = (typeof STATUS_RANGES)[number]

const empty: HttpCheckConfig = {
  method: 'GET',
  headers: {},
  body: '',
  acceptedStatusRanges: ['2xx'],
  maxLatencyMs: null,
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

function parseStatusRanges(input: unknown): StatusRange[] {
  if (input === undefined || input === null) return ['2xx']
  if (!Array.isArray(input)) {
    throw new Error(`acceptedStatusRanges must be an array of ${STATUS_RANGES.join(', ')}`)
  }
  const out: StatusRange[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw new Error(
        `acceptedStatusRanges must be an array of ${STATUS_RANGES.join(', ')}`,
      )
    }
    const normalized = raw.trim().toLowerCase()
    if (!(STATUS_RANGES as readonly string[]).includes(normalized)) {
      throw new Error(
        `acceptedStatusRanges must only include ${STATUS_RANGES.join(', ')}`,
      )
    }
    out.push(normalized as StatusRange)
  }
  if (out.length === 0) {
    throw new Error('acceptedStatusRanges must include at least one range')
  }
  return Array.from(new Set(out))
}

function parseMaxLatencyMs(input: unknown): number | null {
  if (input === undefined || input === null || input === '') return null
  const value =
    typeof input === 'number'
      ? input
      : typeof input === 'string'
        ? Number(input)
        : Number.NaN
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('maxLatencyMs must be a positive number when provided')
  }
  return Math.floor(value)
}

export function normalizeConfig(input: unknown): HttpCheckConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(
      'body must be { method?, headers?, body?, acceptedStatusRanges?, maxLatencyMs? }',
    )
  }
  const row = input as Record<string, unknown>
  const body =
    row.body === undefined || row.body === null ? '' : String(row.body)
  return {
    method: parseMethod(row.method),
    headers: parseHeaders(row.headers),
    body,
    acceptedStatusRanges: parseStatusRanges(row.acceptedStatusRanges),
    maxLatencyMs: parseMaxLatencyMs(row.maxLatencyMs),
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
