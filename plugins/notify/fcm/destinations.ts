import fs from 'node:fs'
import path from 'node:path'

export interface FcmDestination {
  id: number
  fid: string
  label: string
  enabled: number
  created_at: string
  last_test_ok: number | null
  last_test_error: string | null
  last_tested_at: string | null
}

function destinationsPath(): string {
  if (process.env.FCM_TOKENS_PATH) {
    return path.resolve(process.env.FCM_TOKENS_PATH)
  }
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'fcm-tokens.json')
}

function mapDestination(raw: unknown): FcmDestination | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const fid =
    typeof row.fid === 'string'
      ? row.fid.trim()
      : typeof row.token === 'string'
        ? row.token.trim()
        : ''
  if (typeof row.id !== 'number' || !fid) return null
  return {
    id: row.id,
    fid,
    label: typeof row.label === 'string' ? row.label : '',
    enabled: row.enabled === 0 ? 0 : 1,
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

function readAll(): FcmDestination[] {
  const file = destinationsPath()
  if (!fs.existsSync(file)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    const mapped = raw
      .map(mapDestination)
      .filter((r): r is FcmDestination => r != null)
    const needsMigration =
      mapped.length > 0 &&
      raw.some(
        item =>
          item &&
          typeof item === 'object' &&
          !('fid' in (item as Record<string, unknown>)) &&
          typeof (item as Record<string, unknown>).token === 'string',
      )
    if (needsMigration) writeAll(mapped)
    return mapped
  } catch (err) {
    console.error('[notify:fcm] failed to read destinations file', err)
    return []
  }
}

function writeAll(rows: FcmDestination[]): void {
  const file = destinationsPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8')
}

export function listDestinations(): FcmDestination[] {
  return readAll().sort((a, b) => a.id - b.id)
}

export type DestinationImportItem = {
  fid: string
  label: string
}

export type DestinationImportResult = {
  created: FcmDestination[]
  skipped: Array<{fid: string; reason: string}>
}

function asImportList(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === 'object') {
    const rec = input as {fids?: unknown}
    if (Array.isArray(rec.fids)) return rec.fids
  }
  throw new Error('import must be a JSON array of FIDs, or { "fids": [...] }')
}

export function parseDestinationImport(
  input: unknown,
): DestinationImportItem[] {
  const list = asImportList(input)
  if (list.length === 0) throw new Error('import array is empty')
  const items: DestinationImportItem[] = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (typeof item === 'string') {
      const fid = item.trim()
      if (!fid) throw new Error(`item ${i}: fid required`)
      items.push({fid, label: ''})
      continue
    }
    if (!item || typeof item !== 'object') {
      throw new Error(`item ${i}: must be a string or object`)
    }
    const row = item as Record<string, unknown>
    const fid = typeof row.fid === 'string' ? row.fid.trim() : ''
    if (!fid) throw new Error(`item ${i}: fid required`)
    items.push({
      fid,
      label: typeof row.label === 'string' ? row.label.trim() : '',
    })
  }
  return items
}

export function importDestinations(input: unknown): DestinationImportResult {
  const items = parseDestinationImport(input)
  const rows = readAll()
  const existing = new Set(rows.map(r => r.fid))
  const seen = new Set<string>()
  const created: FcmDestination[] = []
  const skipped: Array<{fid: string; reason: string}> = []
  let nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
  const now = new Date().toISOString()

  for (const item of items) {
    if (existing.has(item.fid) || seen.has(item.fid)) {
      skipped.push({fid: item.fid, reason: 'already exists'})
      continue
    }
    seen.add(item.fid)
    const row: FcmDestination = {
      id: nextId,
      fid: item.fid,
      label: item.label,
      enabled: 1,
      created_at: now,
      last_test_ok: null,
      last_test_error: null,
      last_tested_at: null,
    }
    nextId += 1
    rows.push(row)
    existing.add(item.fid)
    created.push(row)
  }
  if (created.length > 0) writeAll(rows)
  return {created, skipped}
}

export function getDestination(id: number): FcmDestination | undefined {
  return readAll().find(r => r.id === id)
}

export type DestinationTestStatus = 'ok' | 'sent' | 'error'

function testStatusToDb(status: DestinationTestStatus): number {
  if (status === 'ok') return 1
  if (status === 'sent') return 2
  return 0
}

export function recordDestinationTest(
  id: number,
  status: DestinationTestStatus,
  error: string | null,
  extra?: {enabled?: boolean},
): FcmDestination | undefined {
  const rows = readAll()
  const idx = rows.findIndex(r => r.id === id)
  if (idx < 0) return undefined
  const existing = rows[idx]!
  const next: FcmDestination = {
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

/** Upsert a destination for mobile self-registration (re-enables on repeat register). */
export function registerDestination(fid: string, label = ''): FcmDestination {
  const trimmed = fid.trim()
  if (!trimmed) throw new Error('fid required')
  const rows = readAll()
  const idx = rows.findIndex(r => r.fid === trimmed)
  if (idx < 0) return createDestination(trimmed, label)
  const existing = rows[idx]!
  const nextLabel = label.trim() || existing.label
  const next: FcmDestination = {
    ...existing,
    label: nextLabel,
    enabled: 1,
  }
  rows[idx] = next
  writeAll(rows)
  return next
}

export function createDestination(fid: string, label = ''): FcmDestination {
  const trimmed = fid.trim()
  if (!trimmed) throw new Error('fid required')
  const rows = readAll()
  if (rows.some(r => r.fid === trimmed)) {
    throw new Error('UNIQUE constraint failed: fid already exists')
  }
  const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
  const row: FcmDestination = {
    id,
    fid: trimmed,
    label: label.trim(),
    enabled: 1,
    created_at: new Date().toISOString(),
    last_test_ok: null,
    last_test_error: null,
    last_tested_at: null,
  }
  rows.push(row)
  writeAll(rows)
  return row
}

export function updateDestination(
  id: number,
  patch: Partial<{fid: string; label: string; enabled: boolean | number}>,
): FcmDestination | undefined {
  const rows = readAll()
  const idx = rows.findIndex(r => r.id === id)
  if (idx < 0) return undefined
  const existing = rows[idx]!
  const fid = patch.fid !== undefined ? patch.fid.trim() : existing.fid
  if (!fid) throw new Error('fid required')
  if (fid !== existing.fid && rows.some(r => r.id !== id && r.fid === fid)) {
    throw new Error('UNIQUE constraint failed: fid already exists')
  }
  const fidChanged = fid !== existing.fid
  const next: FcmDestination = {
    ...existing,
    fid,
    label: patch.label !== undefined ? patch.label.trim() : existing.label,
    enabled:
      patch.enabled !== undefined
        ? patch.enabled === true || patch.enabled === 1
          ? 1
          : 0
        : existing.enabled,
    last_test_ok: fidChanged ? null : existing.last_test_ok,
    last_test_error: fidChanged ? null : existing.last_test_error,
    last_tested_at: fidChanged ? null : existing.last_tested_at,
  }
  rows[idx] = next
  writeAll(rows)
  return next
}

export function deleteDestination(id: number): boolean {
  const rows = readAll()
  const next = rows.filter(r => r.id !== id)
  if (next.length === rows.length) return false
  writeAll(next)
  return true
}
