import fs from 'node:fs'
import path from 'node:path'
import type { FcmToken } from '../../types.js'

type TokenRow = FcmToken

function tokensPath(): string {
  if (process.env.FCM_TOKENS_PATH) {
    return path.resolve(process.env.FCM_TOKENS_PATH)
  }
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'fcm-tokens.json')
}

function readAll(): TokenRow[] {
  const file = tokensPath()
  if (!fs.existsSync(file)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (row): row is TokenRow =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as TokenRow).id === 'number' &&
        typeof (row as TokenRow).token === 'string',
    )
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

export function createToken(token: string, label = ''): FcmToken {
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
    created_at: new Date().toISOString(),
  }
  rows.push(row)
  writeAll(rows)
  return row
}

export function deleteToken(id: number): boolean {
  const rows = readAll()
  const next = rows.filter((r) => r.id !== id)
  if (next.length === rows.length) return false
  writeAll(next)
  return true
}

export function enabledTokens(): string[] {
  return readAll()
    .filter((r) => r.enabled)
    .map((r) => r.token)
}
