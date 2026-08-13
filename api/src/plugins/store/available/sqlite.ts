import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AlertPolicy,
  CheckResult,
  FcmToken,
  Group,
  GroupTreeNode,
  HealthStatus,
  Settings,
  StorePlugin,
  Target,
  TargetState,
} from '../../types.js'
import { healthToDb } from '../../types.js'

let db: Database.Database | undefined

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

function ensureColumn(
  table: string,
  column: string,
  definition: string,
): void {
  const cols = getDb()
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function localSegment(id: number): string {
  return `group_${id}`
}

/** Root: group_{id}. Child: group_{rootSeg}_{childSeg}_... */
function computeTagForPath(pathIds: number[]): string {
  if (pathIds.length === 0) throw new Error('empty group path')
  if (pathIds.length === 1) return localSegment(pathIds[0]!)
  return `group_${pathIds.map(localSegment).join('_')}`
}

function pathIdsToRoot(id: number, parent: number): number[] {
  const ids: number[] = [id]
  let p = parent
  const seen = new Set<number>([id])
  while (p !== 0) {
    if (seen.has(p)) throw new Error('group parent cycle detected')
    seen.add(p)
    const row = getDb()
      .prepare(`SELECT id, parent FROM groups WHERE id = ?`)
      .get(p) as { id: number; parent: number } | undefined
    if (!row) throw new Error(`parent group ${p} not found`)
    ids.unshift(row.id)
    p = row.parent
  }
  return ids
}

function readGroup(id: number): Group | undefined {
  return getDb().prepare(`SELECT * FROM groups WHERE id = ?`).get(id) as
    | Group
    | undefined
}

function setGroupTag(id: number, tag: string): void {
  getDb()
    .prepare(
      `UPDATE groups SET tag = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(tag, id)
}

function recomputeTag(id: number): void {
  const g = readGroup(id)
  if (!g) return
  const tag = computeTagForPath(pathIdsToRoot(g.id, g.parent))
  setGroupTag(g.id, tag)
}

function descendantIds(rootId: number): number[] {
  const all = getDb()
    .prepare(`SELECT id, parent FROM groups`)
    .all() as Array<{ id: number; parent: number }>
  const byParent = new Map<number, number[]>()
  for (const row of all) {
    const list = byParent.get(row.parent) ?? []
    list.push(row.id)
    byParent.set(row.parent, list)
  }
  const out: number[] = []
  const stack = [...(byParent.get(rootId) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    out.push(id)
    for (const child of byParent.get(id) ?? []) stack.push(child)
  }
  return out
}

function wouldCreateCycle(id: number, newParent: number): boolean {
  if (newParent === 0) return false
  if (newParent === id) return true
  return descendantIds(id).includes(newParent)
}

function assertChildGroupForTarget(groupId: number | null | undefined): void {
  if (groupId === null || groupId === undefined) return
  const g = readGroup(groupId)
  if (!g) throw new Error(`group ${groupId} not found`)
  if (g.parent === 0) {
    throw new Error('targets must belong to a child group (not a root)')
  }
}

function buildTree(rows: Group[]): GroupTreeNode[] {
  const nodes = new Map<number, GroupTreeNode>()
  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] })
  }
  const roots: GroupTreeNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)!
    if (row.parent === 0) {
      roots.push(node)
      continue
    }
    const parent = nodes.get(row.parent)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

const store: StorePlugin = {
  id: 'sqlite',

  init(config: { databasePath: string }): void {
    const dir = path.dirname(config.databasePath)
    fs.mkdirSync(dir, { recursive: true })

    db = new Database(config.databasePath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups(parent);

      CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL DEFAULT 60,
        enabled INTEGER NOT NULL DEFAULT 1,
        group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS check_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
        ok INTEGER NOT NULL,
        status_code INTEGER,
        error TEXT,
        latency_ms INTEGER,
        checked_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_check_results_target_checked
        ON check_results(target_id, checked_at DESC);

      CREATE TABLE IF NOT EXISTS target_state (
        target_id INTEGER PRIMARY KEY REFERENCES targets(id) ON DELETE CASCADE,
        is_up INTEGER,
        last_alert_at TEXT,
        last_checked_at TEXT,
        last_status_code INTEGER,
        last_error TEXT,
        last_latency_ms INTEGER
      );
    `)

    // Existing DBs created before groups/group_id
    ensureColumn(
      'targets',
      'group_id',
      'INTEGER REFERENCES groups(id) ON DELETE SET NULL',
    )

    const insertSetting = db.prepare(
      `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    )
    insertSetting.run('alert_policy', 'state_change')
    insertSetting.run('throttle_minutes', '30')
  },

  getSettings(): Settings {
    const rows = getDb()
      .prepare(`SELECT key, value FROM settings`)
      .all() as Array<{ key: string; value: string }>
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    const policy = map.alert_policy as AlertPolicy
    return {
      alert_policy: ['state_change', 'every_fail', 'throttle'].includes(policy)
        ? policy
        : 'state_change',
      throttle_minutes: Math.max(1, Number(map.throttle_minutes) || 30),
    }
  },

  updateSettings(partial: Partial<Settings>): Settings {
    const current = store.getSettings()
    const next: Settings = {
      alert_policy: partial.alert_policy ?? current.alert_policy,
      throttle_minutes: partial.throttle_minutes ?? current.throttle_minutes,
    }
    if (!['state_change', 'every_fail', 'throttle'].includes(next.alert_policy)) {
      throw new Error('Invalid alert_policy')
    }
    if (!Number.isFinite(next.throttle_minutes) || next.throttle_minutes < 1) {
      throw new Error('throttle_minutes must be >= 1')
    }
    const upsert = getDb().prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    upsert.run('alert_policy', next.alert_policy)
    upsert.run('throttle_minutes', String(next.throttle_minutes))
    return next
  },

  listGroups(): Group[] {
    return getDb()
      .prepare(`SELECT * FROM groups ORDER BY id ASC`)
      .all() as Group[]
  },

  listGroupTree(): GroupTreeNode[] {
    return buildTree(store.listGroups())
  },

  getGroup(id: number): Group | undefined {
    return readGroup(id)
  },

  createGroup(input: { parent?: number; name?: string; tag?: string }): Group {
    const parent = input.parent ?? 0
    if (parent !== 0 && !readGroup(parent)) {
      throw new Error(`parent group ${parent} not found`)
    }
    const name = (input.name ?? '').trim()
    const placeholder = `__tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const result = getDb()
      .prepare(`INSERT INTO groups (parent, name, tag) VALUES (?, ?, ?)`)
      .run(parent, name, placeholder)
    const id = Number(result.lastInsertRowid)
    const tag =
      input.tag?.trim() ||
      computeTagForPath(pathIdsToRoot(id, parent))
    try {
      setGroupTag(id, tag)
    } catch (err) {
      getDb().prepare(`DELETE FROM groups WHERE id = ?`).run(id)
      throw err
    }
    return readGroup(id)!
  },

  updateGroup(
    id: number,
    patch: Partial<{ parent: number; name: string; tag: string }>,
  ): Group | undefined {
    const existing = readGroup(id)
    if (!existing) return undefined

    const parent =
      patch.parent !== undefined ? patch.parent : existing.parent
    const name =
      patch.name !== undefined ? patch.name.trim() : existing.name

    if (parent !== 0 && !readGroup(parent)) {
      throw new Error(`parent group ${parent} not found`)
    }
    if (wouldCreateCycle(id, parent)) {
      throw new Error('cannot move group under itself or a descendant')
    }

    getDb()
      .prepare(
        `UPDATE groups SET parent = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(parent, name, id)

    if (patch.tag !== undefined && patch.tag.trim()) {
      setGroupTag(id, patch.tag.trim())
    } else if (parent !== existing.parent) {
      recomputeTag(id)
      for (const childId of descendantIds(id)) recomputeTag(childId)
    }

    return readGroup(id)
  },

  deleteGroup(id: number): boolean {
    if (!readGroup(id)) return false
    const ids = [id, ...descendantIds(id)].sort((a, b) => b - a)
    const del = getDb().prepare(`DELETE FROM groups WHERE id = ?`)
    const tx = getDb().transaction(() => {
      for (const gid of ids) del.run(gid)
    })
    tx()
    return true
  },

  listTargets(): Target[] {
    return getDb()
      .prepare(`SELECT * FROM targets ORDER BY id ASC`)
      .all() as Target[]
  },

  getTarget(id: number): Target | undefined {
    return getDb().prepare(`SELECT * FROM targets WHERE id = ?`).get(id) as
      | Target
      | undefined
  },

  createTarget(
    url: string,
    intervalSeconds: number,
    enabled = true,
    groupId: number | null = null,
  ): Target {
    assertChildGroupForTarget(groupId)
    const result = getDb()
      .prepare(
        `INSERT INTO targets (url, interval_seconds, enabled, group_id) VALUES (?, ?, ?, ?)`,
      )
      .run(url, intervalSeconds, enabled ? 1 : 0, groupId)
    const id = Number(result.lastInsertRowid)
    getDb()
      .prepare(`INSERT INTO target_state (target_id) VALUES (?)`)
      .run(id)
    return store.getTarget(id)!
  },

  updateTarget(
    id: number,
    patch: Partial<{
      url: string
      interval_seconds: number
      enabled: boolean
      group_id: number | null
    }>,
  ): Target | undefined {
    const existing = store.getTarget(id)
    if (!existing) return undefined
    const url = patch.url ?? existing.url
    const interval = patch.interval_seconds ?? existing.interval_seconds
    const enabled =
      patch.enabled === undefined ? existing.enabled : patch.enabled ? 1 : 0
    const groupId =
      patch.group_id !== undefined ? patch.group_id : existing.group_id
    assertChildGroupForTarget(groupId)
    getDb()
      .prepare(
        `UPDATE targets SET url = ?, interval_seconds = ?, enabled = ?, group_id = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(url, interval, enabled, groupId, id)
    return store.getTarget(id)
  },

  deleteTarget(id: number): boolean {
    const result = getDb().prepare(`DELETE FROM targets WHERE id = ?`).run(id)
    return result.changes > 0
  },

  listTokens(): FcmToken[] {
    return getDb()
      .prepare(`SELECT * FROM fcm_tokens ORDER BY id ASC`)
      .all() as FcmToken[]
  },

  createToken(token: string, label = ''): FcmToken {
    const result = getDb()
      .prepare(`INSERT INTO fcm_tokens (token, label) VALUES (?, ?)`)
      .run(token, label)
    return getDb()
      .prepare(`SELECT * FROM fcm_tokens WHERE id = ?`)
      .get(Number(result.lastInsertRowid)) as FcmToken
  },

  deleteToken(id: number): boolean {
    const result = getDb().prepare(`DELETE FROM fcm_tokens WHERE id = ?`).run(id)
    return result.changes > 0
  },

  enabledTokens(): string[] {
    return (
      getDb()
        .prepare(`SELECT token FROM fcm_tokens WHERE enabled = 1`)
        .all() as Array<{ token: string }>
    ).map((r) => r.token)
  },

  getTargetState(targetId: number): TargetState | undefined {
    return getDb()
      .prepare(`SELECT * FROM target_state WHERE target_id = ?`)
      .get(targetId) as TargetState | undefined
  },

  recordCheckResult(input: {
    targetId: number
    status: HealthStatus
    statusCode: number | null
    error: string | null
    latencyMs: number | null
  }): void {
    const database = getDb()
    const code = healthToDb(input.status)
    database
      .prepare(
        `INSERT INTO check_results (target_id, ok, status_code, error, latency_ms)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.targetId,
        code,
        input.statusCode,
        input.error,
        input.latencyMs,
      )

    database
      .prepare(
        `INSERT INTO target_state (target_id, is_up, last_checked_at, last_status_code, last_error, last_latency_ms)
         VALUES (?, ?, datetime('now'), ?, ?, ?)
         ON CONFLICT(target_id) DO UPDATE SET
           is_up = excluded.is_up,
           last_checked_at = excluded.last_checked_at,
           last_status_code = excluded.last_status_code,
           last_error = excluded.last_error,
           last_latency_ms = excluded.last_latency_ms`,
      )
      .run(
        input.targetId,
        code,
        input.statusCode,
        input.error,
        input.latencyMs,
      )

    database
      .prepare(
        `DELETE FROM check_results
         WHERE target_id = ?
           AND id NOT IN (
             SELECT id FROM check_results
             WHERE target_id = ?
             ORDER BY checked_at DESC, id DESC
             LIMIT 500
           )`,
      )
      .run(input.targetId, input.targetId)
  },

  markAlertSent(targetId: number): void {
    getDb()
      .prepare(
        `UPDATE target_state SET last_alert_at = datetime('now') WHERE target_id = ?`,
      )
      .run(targetId)
  },

  listRecentResults(targetId: number, limit = 50): CheckResult[] {
    return getDb()
      .prepare(
        `SELECT * FROM check_results WHERE target_id = ? ORDER BY checked_at DESC, id DESC LIMIT ?`,
      )
      .all(targetId, limit) as CheckResult[]
  },

  getStatusSummary() {
    return getDb()
      .prepare(
        `SELECT t.id, t.url, t.interval_seconds, t.enabled, t.group_id,
                g.tag AS group_tag,
                s.is_up, s.last_checked_at, s.last_status_code, s.last_error,
                s.last_latency_ms, s.last_alert_at
         FROM targets t
         LEFT JOIN groups g ON g.id = t.group_id
         LEFT JOIN target_state s ON s.target_id = t.id
         ORDER BY t.id ASC`,
      )
      .all()
  },
}

export default store
