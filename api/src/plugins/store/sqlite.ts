import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AlertPolicy,
  CheckResult,
  FcmToken,
  Settings,
  StorePlugin,
  Target,
  TargetState,
} from '../types.js'

export function createSqliteStore(): StorePlugin {
  let db: Database.Database | undefined

  function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized')
    return db
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
        CREATE TABLE IF NOT EXISTS targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          interval_seconds INTEGER NOT NULL DEFAULT 60,
          enabled INTEGER NOT NULL DEFAULT 1,
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

    createTarget(url: string, intervalSeconds: number, enabled = true): Target {
      const result = getDb()
        .prepare(
          `INSERT INTO targets (url, interval_seconds, enabled) VALUES (?, ?, ?)`,
        )
        .run(url, intervalSeconds, enabled ? 1 : 0)
      const id = Number(result.lastInsertRowid)
      getDb()
        .prepare(`INSERT INTO target_state (target_id) VALUES (?)`)
        .run(id)
      return store.getTarget(id)!
    },

    updateTarget(
      id: number,
      patch: Partial<{ url: string; interval_seconds: number; enabled: boolean }>,
    ): Target | undefined {
      const existing = store.getTarget(id)
      if (!existing) return undefined
      const url = patch.url ?? existing.url
      const interval = patch.interval_seconds ?? existing.interval_seconds
      const enabled =
        patch.enabled === undefined ? existing.enabled : patch.enabled ? 1 : 0
      getDb()
        .prepare(
          `UPDATE targets SET url = ?, interval_seconds = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(url, interval, enabled, id)
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
      ok: boolean
      statusCode: number | null
      error: string | null
      latencyMs: number | null
    }): void {
      const database = getDb()
      database
        .prepare(
          `INSERT INTO check_results (target_id, ok, status_code, error, latency_ms)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          input.targetId,
          input.ok ? 1 : 0,
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
          input.ok ? 1 : 0,
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
          `SELECT t.id, t.url, t.interval_seconds, t.enabled,
                  s.is_up, s.last_checked_at, s.last_status_code, s.last_error,
                  s.last_latency_ms, s.last_alert_at
           FROM targets t
           LEFT JOIN target_state s ON s.target_id = t.id
           ORDER BY t.id ASC`,
        )
        .all()
    },
  }

  return store
}
