import fs from 'node:fs'
import path from 'node:path'
import type { AlertEvent, FcmToken } from '../../types.js'

type TokenRow = FcmToken

function tokensPath(): string {
  if (process.env.FCM_TOKENS_PATH) {
    return path.resolve(process.env.FCM_TOKENS_PATH)
  }
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'fcm-tokens.json')
}

export function normalizeTargetIds(input: unknown): number[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    throw new Error('target_ids must be an array of positive integers')
  }
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of input) {
    const n = typeof item === 'number' ? item : Number(item)
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('target_ids must be an array of positive integers')
    }
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function normalizeCheckIds(input: unknown): string[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    throw new Error('check_ids must be an array of strings')
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error('check_ids must be an array of non-empty strings')
    }
    const id = item.trim()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function mapToken(raw: unknown): FcmToken | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.token !== 'string') return null
  let targetIds: number[] = []
  let checkIds: string[] = []
  try {
    targetIds = normalizeTargetIds(row.target_ids ?? [])
  } catch {
    targetIds = []
  }
  try {
    checkIds = normalizeCheckIds(row.check_ids ?? [])
  } catch {
    checkIds = []
  }
  return {
    id: row.id,
    token: row.token,
    label: typeof row.label === 'string' ? row.label : '',
    enabled: row.enabled === 0 ? 0 : 1,
    target_ids: targetIds,
    check_ids: checkIds,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    last_test_ok:
      row.last_test_ok === 1 || row.last_test_ok === 2 || row.last_test_ok === 0
        ? row.last_test_ok
        : null,
    last_test_error:
      typeof row.last_test_error === 'string' ? row.last_test_error : null,
    last_tested_at:
      typeof row.last_tested_at === 'string' ? row.last_tested_at : null,
  }
}

function readAll(): TokenRow[] {
  const file = tokensPath()
  if (!fs.existsSync(file)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.map(mapToken).filter((r): r is FcmToken => r != null)
  } catch (err) {
    console.error('[notify:fcm] failed to read tokens file', err)
    return []
  }
}

function writeAll(rows: TokenRow[]): void {
  const file = tokensPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8')
}

export function listTokens(): FcmToken[] {
  return readAll().sort((a, b) => a.id - b.id)
}

export type TokenImportItem = {
  token: string
  label: string
  target_ids: number[]
  check_ids: string[]
}

export type TokenImportResult = {
  created: FcmToken[]
  skipped: Array<{ token: string; reason: string }>
}

function asImportList(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === 'object') {
    const rec = input as { fids?: unknown; tokens?: unknown }
    if (Array.isArray(rec.fids)) return rec.fids
    if (Array.isArray(rec.tokens)) return rec.tokens
  }
  throw new Error(
    'import must be a JSON array of FIDs, or { "fids": [...] } / { "tokens": [...] }',
  )
}

export function parseTokenImport(input: unknown): TokenImportItem[] {
  const list = asImportList(input)
  if (list.length === 0) {
    throw new Error('import array is empty')
  }
  const items: TokenImportItem[] = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (typeof item === 'string') {
      const token = item.trim()
      if (!token) throw new Error(`item ${i}: token required`)
      items.push({ token, label: '', target_ids: [], check_ids: [] })
      continue
    }
    if (!item || typeof item !== 'object') {
      throw new Error(`item ${i}: must be a string or object`)
    }
    const row = item as Record<string, unknown>
    const token =
      typeof row.fid === 'string' && row.fid.trim()
        ? row.fid.trim()
        : typeof row.token === 'string'
          ? row.token.trim()
          : ''
    if (!token) throw new Error(`item ${i}: fid or token required`)
    items.push({
      token,
      label: typeof row.label === 'string' ? row.label.trim() : '',
      target_ids: normalizeTargetIds(row.target_ids),
      check_ids: normalizeCheckIds(row.check_ids),
    })
  }
  return items
}

export function importTokens(input: unknown): TokenImportResult {
  const items = parseTokenImport(input)
  const rows = readAll()
  const existing = new Set(rows.map((r) => r.token))
  const seen = new Set<string>()
  const created: FcmToken[] = []
  const skipped: Array<{ token: string; reason: string }> = []
  let nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
  const now = new Date().toISOString()

  for (const item of items) {
    if (existing.has(item.token) || seen.has(item.token)) {
      skipped.push({ token: item.token, reason: 'already exists' })
      continue
    }
    seen.add(item.token)
    const row: TokenRow = {
      id: nextId,
      token: item.token,
      label: item.label,
      enabled: 1,
      target_ids: item.target_ids,
      check_ids: item.check_ids,
      created_at: now,
      last_test_ok: null,
      last_test_error: null,
      last_tested_at: null,
    }
    nextId += 1
    rows.push(row)
    existing.add(item.token)
    created.push(row)
  }
  if (created.length > 0) writeAll(rows)
  return { created, skipped }
}

export function getToken(id: number): FcmToken | undefined {
  return readAll().find((r) => r.id === id)
}

export type TokenTestStatus = 'ok' | 'sent' | 'error'

function testStatusToDb(status: TokenTestStatus): number {
  if (status === 'ok') return 1
  if (status === 'sent') return 2
  return 0
}

export function recordTokenTest(
  id: number,
  status: TokenTestStatus,
  error: string | null,
  extra?: { enabled?: boolean },
): FcmToken | undefined {
  const rows = readAll()
  const idx = rows.findIndex((r) => r.id === id)
  if (idx < 0) return undefined
  const existing = rows[idx]!
  const next: FcmToken = {
    ...existing,
    last_test_ok: testStatusToDb(status),
    last_test_error: status === 'error' ? error : null,
    last_tested_at: new Date().toISOString(),
    enabled:
      extra?.enabled !== undefined ? (extra.enabled ? 1 : 0) : existing.enabled,
  }
  rows[idx] = next
  writeAll(rows)
  return next
}

export function createToken(
  token: string,
  label = '',
  targetIds: number[] = [],
  checkIds: string[] = [],
): FcmToken {
  const rows = readAll()
  if (rows.some((r) => r.token === token)) {
    throw new Error('UNIQUE constraint failed: token already exists')
  }
  const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
  const row: TokenRow = {
    id,
    token,
    label,
    enabled: 1,
    target_ids: normalizeTargetIds(targetIds),
    check_ids: normalizeCheckIds(checkIds),
    created_at: new Date().toISOString(),
    last_test_ok: null,
    last_test_error: null,
    last_tested_at: null,
  }
  rows.push(row)
  writeAll(rows)
  return row
}

export function updateToken(
  id: number,
  patch: Partial<{
    label: string
    enabled: boolean | number
    target_ids: number[]
    check_ids: string[]
  }>,
): FcmToken | undefined {
  const rows = readAll()
  const idx = rows.findIndex((r) => r.id === id)
  if (idx < 0) return undefined
  const existing = rows[idx]!
  const next: FcmToken = {
    ...existing,
    label: patch.label !== undefined ? patch.label : existing.label,
    enabled:
      patch.enabled !== undefined
        ? patch.enabled === true || patch.enabled === 1
          ? 1
          : 0
        : existing.enabled,
    target_ids:
      patch.target_ids !== undefined
        ? normalizeTargetIds(patch.target_ids)
        : existing.target_ids,
    check_ids:
      patch.check_ids !== undefined
        ? normalizeCheckIds(patch.check_ids)
        : existing.check_ids,
  }
  rows[idx] = next
  writeAll(rows)
  return next
}

export function deleteToken(id: number): boolean {
  const rows = readAll()
  const next = rows.filter((r) => r.id !== id)
  if (next.length === rows.length) return false
  writeAll(next)
  return true
}

/** Whether this token should receive the given alert. */
export function tokenMatchesAlert(row: FcmToken, event: AlertEvent): boolean {
  if (!row.enabled) return false
  if (
    row.target_ids.length > 0 &&
    !row.target_ids.includes(event.target.id)
  ) {
    return false
  }
  if (row.check_ids.length === 0) return true
  // Non-empty check allowlist: only failure overlap; skip recoveries.
  if (event.status === 'up') return false
  const failed = new Set(
    event.checks.filter((c) => !c.ok).map((c) => c.id),
  )
  return row.check_ids.some((id) => failed.has(id))
}

export function matchingTokenStrings(event: AlertEvent): string[] {
  return listTokens()
    .filter((r) => tokenMatchesAlert(r, event))
    .map((r) => r.token)
}
