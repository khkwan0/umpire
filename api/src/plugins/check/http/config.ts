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
  acceptedStatusCodes: number[]
  maxLatencyMs: number | null
}

export const STATUS_RANGES = ['1xx', '2xx', '3xx', '4xx', '5xx'] as const
export type StatusRange = (typeof STATUS_RANGES)[number]

export const defaultHttpCheckConfig: HttpCheckConfig = {
  method: 'GET',
  headers: {},
  body: '',
  acceptedStatusRanges: ['2xx'],
  acceptedStatusCodes: [],
  maxLatencyMs: null,
}

export interface HttpCheckTargetOverride {
  useCustom: boolean
  method?: HttpMethod
  headers?: Record<string, string>
  body?: string
  acceptedStatusRanges?: StatusRange[]
  acceptedStatusCodes?: number[]
  maxLatencyMs?: number | null
}

export interface HttpCheckTargetConfigView {
  useCustom: boolean
  defaults: HttpCheckConfig
  override: HttpCheckConfig | null
  effective: HttpCheckConfig
}

function defaultsPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'http-check-defaults.json')
}

export function readDefaults(): HttpCheckConfig {
  const file = defaultsPath()
  if (!fs.existsSync(file)) {
    return { ...defaultHttpCheckConfig, headers: {} }
  }
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
  } catch (err) {
    console.error('[check:http] failed to read defaults file', err)
    return { ...defaultHttpCheckConfig, headers: {} }
  }
}

export function writeDefaults(input: unknown): HttpCheckConfig {
  const config = normalizeConfig(input)
  const file = defaultsPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function isFullHttpCheckConfig(row: Record<string, unknown>): boolean {
  return typeof row.method === 'string' && !('useCustom' in row)
}

export function parseStoredOverride(stored: unknown): HttpCheckTargetOverride | null {
  if (stored === null || stored === undefined) return null
  if (typeof stored !== 'object' || Array.isArray(stored)) return null
  const row = stored as Record<string, unknown>
  if (row.useCustom === false) return null
  if (row.useCustom === undefined && isFullHttpCheckConfig(row)) {
    const legacy = normalizeConfig(stored)
    return {
      useCustom: true,
      method: legacy.method,
      headers: legacy.headers,
      body: legacy.body,
      acceptedStatusRanges: legacy.acceptedStatusRanges,
      acceptedStatusCodes: legacy.acceptedStatusCodes,
      maxLatencyMs: legacy.maxLatencyMs,
    }
  }
  if (row.useCustom !== true) return null
  const override: HttpCheckTargetOverride = { useCustom: true }
  if (row.method !== undefined) {
    override.method = parseMethod(row.method)
  }
  if (row.headers !== undefined) {
    override.headers = parseHeaders(row.headers)
  }
  if (row.body !== undefined) {
    override.body = String(row.body)
  }
  if (row.acceptedStatusRanges !== undefined) {
    override.acceptedStatusRanges = parseStatusRanges(row.acceptedStatusRanges)
  }
  if (row.acceptedStatusCodes !== undefined) {
    override.acceptedStatusCodes = parseStatusCodes(row.acceptedStatusCodes)
  }
  if (row.maxLatencyMs !== undefined) {
    override.maxLatencyMs = parseMaxLatencyMs(row.maxLatencyMs)
  }
  return override
}

export function mergeHttpCheckConfig(
  defaults: HttpCheckConfig,
  override: HttpCheckTargetOverride | null,
): HttpCheckConfig {
  if (!override?.useCustom) {
    return {
      ...defaults,
      headers: { ...defaults.headers },
      acceptedStatusRanges: [...defaults.acceptedStatusRanges],
      acceptedStatusCodes: [...defaults.acceptedStatusCodes],
    }
  }
  return {
    method: override.method ?? defaults.method,
    headers: override.headers ?? { ...defaults.headers },
    body: override.body ?? defaults.body,
    acceptedStatusRanges:
      override.acceptedStatusRanges ?? [...defaults.acceptedStatusRanges],
    acceptedStatusCodes:
      override.acceptedStatusCodes ?? [...defaults.acceptedStatusCodes],
    maxLatencyMs:
      override.maxLatencyMs !== undefined
        ? override.maxLatencyMs
        : defaults.maxLatencyMs,
  }
}

export function normalizeTargetOverride(input: unknown): HttpCheckTargetOverride {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(
      'body must be { useCustom: true, method?, headers?, body?, acceptedStatusRanges?, acceptedStatusCodes?, maxLatencyMs? }',
    )
  }
  const row = input as Record<string, unknown>
  if (row.useCustom !== true) {
    throw new Error('useCustom must be true when saving a target override')
  }
  const config = normalizeConfig(input)
  return {
    useCustom: true,
    method: config.method,
    headers: config.headers,
    body: config.body,
    acceptedStatusRanges: config.acceptedStatusRanges,
    acceptedStatusCodes: config.acceptedStatusCodes,
    maxLatencyMs: config.maxLatencyMs,
  }
}

export function buildTargetConfigView(stored: unknown): HttpCheckTargetConfigView {
  const defaults = readDefaults()
  const parsed = parseStoredOverride(stored)
  const useCustom = parsed?.useCustom ?? false
  const effective = mergeHttpCheckConfig(defaults, parsed)
  return {
    useCustom,
    defaults,
    override: useCustom ? effective : null,
    effective,
  }
}

export function resolveHttpCheckConfigForTarget(stored: unknown): HttpCheckConfig {
  return buildTargetConfigView(stored).effective
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
  return Array.from(new Set(out))
}

function parseStatusCodes(input: unknown): number[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    throw new Error('acceptedStatusCodes must be an array of integers between 100 and 599')
  }
  const out: number[] = []
  for (const raw of input) {
    const code =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw.trim())
          : Number.NaN
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      throw new Error('acceptedStatusCodes must be integers between 100 and 599')
    }
    out.push(code)
  }
  return Array.from(new Set(out))
}

function validateStatusAcceptance(ranges: StatusRange[], codes: number[]): void {
  if (ranges.length === 0 && codes.length === 0) {
    throw new Error(
      'At least one accepted status range or specific status code is required',
    )
  }
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
      'body must be { method?, headers?, body?, acceptedStatusRanges?, acceptedStatusCodes?, maxLatencyMs? }',
    )
  }
  const row = input as Record<string, unknown>
  const body =
    row.body === undefined || row.body === null ? '' : String(row.body)
  const acceptedStatusRanges = parseStatusRanges(row.acceptedStatusRanges)
  const acceptedStatusCodes = parseStatusCodes(row.acceptedStatusCodes)
  validateStatusAcceptance(acceptedStatusRanges, acceptedStatusCodes)
  return {
    method: parseMethod(row.method),
    headers: parseHeaders(row.headers),
    body,
    acceptedStatusRanges,
    acceptedStatusCodes,
    maxLatencyMs: parseMaxLatencyMs(row.maxLatencyMs),
  }
}

export function resolveHttpCheckConfig(input: unknown): HttpCheckConfig {
  if (input === null || input === undefined) {
    return readDefaults()
  }
  return normalizeConfig(input)
}
