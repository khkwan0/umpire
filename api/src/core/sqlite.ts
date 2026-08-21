import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import {hashSessionToken} from '../auth/cookies.js'
import {assertPasswordPolicy, hashPassword} from '../auth/password.js'
import type {
  AlertPolicy,
  AuthPluginKind,
  AuthPrincipal,
  CheckResult,
  Group,
  GroupTreeNode,
  HealthStatus,
  Role,
  RolePluginRef,
  Settings,
  Target,
  TargetState,
  User,
} from '../plugins/types.js'
import {buildIncidents, type IncidentSourceRow} from '../incidents.js'
import {healthToDb} from '../plugins/types.js'
import {CORE_TABLES} from './schema.js'
import type {CoreStore} from './types.js'

let db: Database.Database | undefined
let dbPath = ''
let stmts: ReturnType<typeof buildStatements> | undefined

function getDb(): Database.Database {
  if (!db) throw new Error('Core database not initialized')
  return db
}

function getStmts() {
  if (!stmts) throw new Error('Core database not initialized')
  return stmts
}

function buildStatements(database: Database.Database) {
  return {
    selectGroupParent: database.prepare(
      `SELECT id, parent FROM groups WHERE id = ?`,
    ),
    selectGroupById: database.prepare(`SELECT * FROM groups WHERE id = ?`),
    updateGroupTag: database.prepare(
      `UPDATE groups SET tag = ?, updated_at = datetime('now') WHERE id = ?`,
    ),
    selectAllGroupsParent: database.prepare(`SELECT id, parent FROM groups`),
    selectSettings: database.prepare(`SELECT key, value FROM settings`),
    upsertSetting: database.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ),
    selectAllGroups: database.prepare(`SELECT * FROM groups ORDER BY id ASC`),
    insertGroup: database.prepare(
      `INSERT INTO groups (parent, name, tag) VALUES (?, ?, ?)`,
    ),
    deleteGroupById: database.prepare(`DELETE FROM groups WHERE id = ?`),
    updateGroup: database.prepare(
      `UPDATE groups SET parent = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
    ),
    selectAllTargets: database.prepare(`SELECT * FROM targets ORDER BY id ASC`),
    selectTargetById: database.prepare(`SELECT * FROM targets WHERE id = ?`),
    selectTargetCheckConfig: database.prepare(
      `SELECT config_json FROM target_check_configs WHERE target_id = ? AND check_id = ?`,
    ),
    selectTargetCheckConfigsByCheck: database.prepare(
      `SELECT target_id, config_json FROM target_check_configs WHERE check_id = ? ORDER BY target_id ASC`,
    ),
    selectTargetNotifierConfig: database.prepare(
      `SELECT config_json FROM target_notifier_configs WHERE target_id = ? AND notifier_id = ?`,
    ),
    selectTargetNotifierConfigsByNotifier: database.prepare(
      `SELECT target_id, config_json FROM target_notifier_configs WHERE notifier_id = ? ORDER BY target_id ASC`,
    ),
    selectAllTargetNotifierConfigs: database.prepare(
      `SELECT target_id, notifier_id, config_json FROM target_notifier_configs ORDER BY notifier_id ASC, target_id ASC`,
    ),
    upsertTargetNotifierConfig: database.prepare(
      `INSERT INTO target_notifier_configs (target_id, notifier_id, config_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(target_id, notifier_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`,
    ),
    deleteTargetNotifierConfig: database.prepare(
      `DELETE FROM target_notifier_configs WHERE target_id = ? AND notifier_id = ?`,
    ),
    upsertTargetCheckConfig: database.prepare(
      `INSERT INTO target_check_configs (target_id, check_id, config_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(target_id, check_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`,
    ),
    deleteTargetCheckConfig: database.prepare(
      `DELETE FROM target_check_configs WHERE target_id = ? AND check_id = ?`,
    ),
    insertTarget: database.prepare(
      `INSERT INTO targets (url, interval_seconds, enabled, group_id, check_ids, notifier_ids) VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    insertTargetState: database.prepare(
      `INSERT INTO target_state (target_id) VALUES (?)`,
    ),
    updateTarget: database.prepare(
      `UPDATE targets SET url = ?, interval_seconds = ?, enabled = ?, group_id = ?, check_ids = ?, notifier_ids = ?, updated_at = datetime('now') WHERE id = ?`,
    ),
    deleteTargetById: database.prepare(`DELETE FROM targets WHERE id = ?`),
    selectTargetState: database.prepare(
      `SELECT * FROM target_state WHERE target_id = ?`,
    ),
    insertCheckResult: database.prepare(
      `INSERT INTO check_results (target_id, ok, status_code, error, latency_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    upsertTargetState: database.prepare(
      `INSERT INTO target_state (target_id, is_up, last_checked_at, last_status_code, last_error, last_latency_ms)
       VALUES (?, ?, datetime('now'), ?, ?, ?)
       ON CONFLICT(target_id) DO UPDATE SET
         is_up = excluded.is_up,
         last_checked_at = excluded.last_checked_at,
         last_status_code = excluded.last_status_code,
         last_error = excluded.last_error,
         last_latency_ms = excluded.last_latency_ms`,
    ),
    pruneCheckResults: database.prepare(
      `DELETE FROM check_results
       WHERE target_id = ?
         AND id NOT IN (
           SELECT id FROM check_results
           WHERE target_id = ?
           ORDER BY checked_at DESC, id DESC
           LIMIT 500
         )`,
    ),
    markAlertSent: database.prepare(
      `UPDATE target_state SET last_alert_at = datetime('now') WHERE target_id = ?`,
    ),
    selectRecentResults: database.prepare(
      `SELECT * FROM check_results WHERE target_id = ? ORDER BY checked_at DESC, id DESC LIMIT ?`,
    ),
    selectIncidentRows: database.prepare(
      `SELECT r.id, r.target_id, r.ok, r.status_code, r.error, r.checked_at,
              t.url, g.tag AS group_tag
       FROM check_results r
       JOIN targets t ON t.id = r.target_id
       LEFT JOIN groups g ON g.id = t.group_id
       ORDER BY r.target_id ASC, r.checked_at ASC, r.id ASC`,
    ),
    selectStatusSummary: database.prepare(
      `SELECT t.id, t.url, t.interval_seconds, t.enabled, t.group_id,
              g.tag AS group_tag,
              s.is_up, s.last_checked_at, s.last_status_code, s.last_error,
              s.last_latency_ms, s.last_alert_at
       FROM targets t
       LEFT JOIN groups g ON g.id = t.group_id
       LEFT JOIN target_state s ON s.target_id = t.id
       ORDER BY t.id ASC`,
    ),
    insertSettingIgnore: database.prepare(
      `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    ),
    insertRoleIgnore: database.prepare(
      `INSERT OR IGNORE INTO roles (slug, name, is_system, can_write) VALUES (?, ?, ?, ?)`,
    ),
    countUsers: database.prepare(`SELECT COUNT(*) AS n FROM users`),
    selectUsers: database.prepare(
      `SELECT u.id, u.username, u.role_id, r.slug AS role_slug, u.created_at, u.updated_at
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.id ASC`,
    ),
    selectUserById: database.prepare(
      `SELECT u.id, u.username, u.role_id, r.slug AS role_slug, u.created_at, u.updated_at
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`,
    ),
    selectUserByUsername: database.prepare(
      `SELECT u.id, u.username, u.role_id, r.slug AS role_slug, u.created_at, u.updated_at
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.username = ? COLLATE NOCASE`,
    ),
    selectUserPasswordHash: database.prepare(
      `SELECT password_hash FROM users WHERE id = ?`,
    ),
    insertUser: database.prepare(
      `INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)`,
    ),
    updateUser: database.prepare(
      `UPDATE users SET username = ?, password_hash = ?, role_id = ?, updated_at = datetime('now') WHERE id = ?`,
    ),
    deleteUserById: database.prepare(`DELETE FROM users WHERE id = ?`),
    selectRoles: database.prepare(`SELECT * FROM roles ORDER BY id ASC`),
    selectRoleById: database.prepare(`SELECT * FROM roles WHERE id = ?`),
    selectRoleBySlug: database.prepare(`SELECT * FROM roles WHERE slug = ?`),
    insertRole: database.prepare(
      `INSERT INTO roles (slug, name, is_system, can_write) VALUES (?, ?, 0, ?)`,
    ),
    updateRole: database.prepare(
      `UPDATE roles SET name = ?, can_write = ?, updated_at = datetime('now') WHERE id = ?`,
    ),
    deleteRoleById: database.prepare(`DELETE FROM roles WHERE id = ?`),
    selectRolePlugins: database.prepare(
      `SELECT kind, plugin_id AS id FROM role_plugins WHERE role_id = ? ORDER BY kind ASC, plugin_id ASC`,
    ),
    deleteRolePlugins: database.prepare(
      `DELETE FROM role_plugins WHERE role_id = ?`,
    ),
    insertRolePlugin: database.prepare(
      `INSERT INTO role_plugins (role_id, kind, plugin_id) VALUES (?, ?, ?)`,
    ),
    countUsersWithRole: database.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role_id = ?`,
    ),
    insertSession: database.prepare(
      `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    ),
    deleteSessionByHash: database.prepare(
      `DELETE FROM sessions WHERE token_hash = ?`,
    ),
    deleteSessionsForUser: database.prepare(
      `DELETE FROM sessions WHERE user_id = ?`,
    ),
    pruneExpiredSessions: database.prepare(
      `DELETE FROM sessions WHERE expires_at < datetime('now')`,
    ),
    selectSessionByHash: database.prepare(
      `SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at >= datetime('now')`,
    ),
    dumpSelect: Object.fromEntries(
      CORE_TABLES.map(table => [
        table.name,
        database.prepare(`SELECT * FROM ${table.name}`),
      ]),
    ) as Record<string, Database.Statement>,
  }
}

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = getDb().pragma(`table_info(${table})`) as Array<{
    name: string
  }>
  if (!cols.some(c => c.name === column)) {
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
    const row = getStmts().selectGroupParent.get(p) as
      {id: number; parent: number} | undefined
    if (!row) throw new Error(`parent group ${p} not found`)
    ids.unshift(row.id)
    p = row.parent
  }
  return ids
}

function readGroup(id: number): Group | undefined {
  return getStmts().selectGroupById.get(id) as Group | undefined
}

function setGroupTag(id: number, tag: string): void {
  getStmts().updateGroupTag.run(tag, id)
}

function recomputeTag(id: number): void {
  const g = readGroup(id)
  if (!g) return
  const tag = computeTagForPath(pathIdsToRoot(g.id, g.parent))
  setGroupTag(g.id, tag)
}

function descendantIds(rootId: number): number[] {
  const all = getStmts().selectAllGroupsParent.all() as Array<{
    id: number
    parent: number
  }>
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

/** Normalize and validate a plugin id allowlist (check_ids / notifier_ids). */
export function normalizePluginIds(
  input: unknown,
  fieldName: string,
): string[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    throw new Error(`${fieldName} must be an array of strings`)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`${fieldName} must be an array of non-empty strings`)
    }
    const id = item.trim()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function parsePluginIdsJson(raw: unknown, fieldName: string): string[] {
  if (raw === null || raw === undefined) return []
  if (typeof raw !== 'string') {
    try {
      return normalizePluginIds(raw, fieldName)
    } catch {
      return []
    }
  }
  try {
    return normalizePluginIds(JSON.parse(raw) as unknown, fieldName)
  } catch {
    return []
  }
}

type UserRow = {
  id: number
  username: string
  role_id: number
  role_slug: string
  created_at: string
  updated_at: string
}

type RoleRow = {
  id: number
  slug: string
  name: string
  is_system: number
  can_write: number
  created_at: string
  updated_at: string
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role_id: row.role_id,
    role_slug: row.role_slug,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapRole(row: RoleRow): Role {
  const isSystem = Boolean(row.is_system)
  const plugins: Role['plugins'] = isSystem
    ? 'all'
    : (
        getStmts().selectRolePlugins.all(row.id) as Array<{
          kind: string
          id: string
        }>
      ).map(p => ({
        kind: p.kind as AuthPluginKind,
        id: p.id,
      }))
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    is_system: isSystem,
    can_write: Boolean(row.can_write),
    plugins,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function normalizeUsername(username: string): string {
  if (typeof username !== 'string' || !username.trim()) {
    throw new Error('username is required')
  }
  const trimmed = username.trim()
  if (trimmed.length < 2) {
    throw new Error('username must be at least 2 characters')
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error(
      'username may only contain letters, numbers, dots, underscores, and hyphens',
    )
  }
  return trimmed
}

function normalizeRoleName(name: string): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('name is required')
  }
  return name.trim()
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'role'
}

function uniqueRoleSlug(base: string): string {
  let slug = base
  let n = 2
  while (getStmts().selectRoleBySlug.get(slug)) {
    slug = `${base}_${n}`
    n += 1
  }
  return slug
}

const AUTH_PLUGIN_KINDS = new Set<AuthPluginKind>([
  'check',
  'notify',
  'scheduler',
])

function normalizeRolePlugins(input: RolePluginRef[]): RolePluginRef[] {
  if (!Array.isArray(input)) {
    throw new Error('plugins must be an array')
  }
  const out: RolePluginRef[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.kind !== 'string' ||
      typeof item.id !== 'string'
    ) {
      throw new Error('plugins entries must include kind and id')
    }
    const kind = item.kind as AuthPluginKind
    const id = item.id.trim()
    if (!AUTH_PLUGIN_KINDS.has(kind)) {
      throw new Error(`invalid plugin kind: ${item.kind}`)
    }
    if (!id) throw new Error('plugin id is required')
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({kind, id})
  }
  return out
}

function replaceRolePlugins(roleId: number, plugins: RolePluginRef[]): void {
  const stmts = getStmts()
  const tx = getDb().transaction(() => {
    stmts.deleteRolePlugins.run(roleId)
    for (const p of plugins) {
      stmts.insertRolePlugin.run(roleId, p.kind, p.id)
    }
  })
  tx()
}

type TargetRow = Omit<Target, 'check_ids' | 'notifier_ids'> & {
  check_ids?: string | null
  notifier_ids?: string | null
}

interface TargetCheckConfigRow {
  config_json: string
}

interface TargetCheckConfigListRow {
  target_id: number
  config_json: string
}

interface TargetNotifierConfigRow {
  config_json: string
}

interface TargetNotifierConfigListRow {
  target_id: number
  config_json: string
}

interface TargetNotifierConfigAllRow {
  target_id: number
  notifier_id: string
  config_json: string
}

function parseConfigJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function mapTarget(row: TargetRow | undefined): Target | undefined {
  if (!row) return undefined
  const {check_ids: rawChecks, notifier_ids: rawNotifiers, ...rest} = row
  return {
    ...rest,
    check_ids: parsePluginIdsJson(rawChecks, 'check_ids'),
    notifier_ids: parsePluginIdsJson(rawNotifiers, 'notifier_ids'),
  }
}

function buildTree(rows: Group[]): GroupTreeNode[] {
  const nodes = new Map<number, GroupTreeNode>()
  for (const row of rows) {
    nodes.set(row.id, {...row, children: []})
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

export const core: CoreStore = {
  databasePath(): string {
    if (!dbPath) throw new Error('Core database not initialized')
    return dbPath
  },

  dataDir(): string {
    return path.dirname(core.databasePath())
  },

  schema() {
    return CORE_TABLES
  },

  dumpData(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {}
    const dumpSelect = getStmts().dumpSelect
    for (const table of CORE_TABLES) {
      const rows = dumpSelect[table.name]!.all() as Array<
        Record<string, unknown>
      >
      if (table.name === 'users') {
        out[table.name] = rows.map(row => ({
          ...row,
          password_hash: '[redacted]',
        }))
      } else if (table.name === 'sessions') {
        out[table.name] = rows.map(row => ({
          ...row,
          token_hash: '[redacted]',
        }))
      } else {
        out[table.name] = rows
      }
    }
    return out
  },

  getSettings(): Settings {
    const rows = getStmts().selectSettings.all() as Array<{
      key: string
      value: string
    }>
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
    const policy = map.alert_policy as AlertPolicy
    return {
      alert_policy: ['state_change', 'every_fail', 'throttle'].includes(policy)
        ? policy
        : 'state_change',
      throttle_minutes: Math.max(1, Number(map.throttle_minutes) || 30),
      auth_enabled: map.auth_enabled === '1',
      allow_readonly_without_auth: map.allow_readonly_without_auth === '1',
    }
  },

  updateSettings(partial: Partial<Settings>): Settings {
    const current = core.getSettings()
    const next: Settings = {
      alert_policy: partial.alert_policy ?? current.alert_policy,
      throttle_minutes: partial.throttle_minutes ?? current.throttle_minutes,
      auth_enabled: partial.auth_enabled ?? current.auth_enabled,
      allow_readonly_without_auth:
        partial.allow_readonly_without_auth ??
        current.allow_readonly_without_auth,
    }
    if (
      !['state_change', 'every_fail', 'throttle'].includes(next.alert_policy)
    ) {
      throw new Error('Invalid alert_policy')
    }
    if (!Number.isFinite(next.throttle_minutes) || next.throttle_minutes < 1) {
      throw new Error('throttle_minutes must be >= 1')
    }
    if (next.auth_enabled && core.countUsers() < 1) {
      throw new Error('Cannot enable auth until at least one user exists')
    }
    const upsert = getStmts().upsertSetting
    upsert.run('alert_policy', next.alert_policy)
    upsert.run('throttle_minutes', String(next.throttle_minutes))
    upsert.run('auth_enabled', next.auth_enabled ? '1' : '0')
    upsert.run(
      'allow_readonly_without_auth',
      next.allow_readonly_without_auth ? '1' : '0',
    )
    return next
  },

  listGroups(): Group[] {
    return getStmts().selectAllGroups.all() as Group[]
  },

  listGroupTree(): GroupTreeNode[] {
    return buildTree(core.listGroups())
  },

  getGroup(id: number): Group | undefined {
    return readGroup(id)
  },

  createGroup(input: {parent?: number; name?: string; tag?: string}): Group {
    const parent = input.parent ?? 0
    if (parent !== 0 && !readGroup(parent)) {
      throw new Error(`parent group ${parent} not found`)
    }
    const name = (input.name ?? '').trim()
    const placeholder = `__tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const result = getStmts().insertGroup.run(parent, name, placeholder)
    const id = Number(result.lastInsertRowid)
    const tag =
      input.tag?.trim() || computeTagForPath(pathIdsToRoot(id, parent))
    try {
      setGroupTag(id, tag)
    } catch (err) {
      getStmts().deleteGroupById.run(id)
      throw err
    }
    return readGroup(id)!
  },

  updateGroup(
    id: number,
    patch: Partial<{parent: number; name: string; tag: string}>,
  ): Group | undefined {
    const existing = readGroup(id)
    if (!existing) return undefined

    const parent = patch.parent !== undefined ? patch.parent : existing.parent
    const name = patch.name !== undefined ? patch.name.trim() : existing.name

    if (parent !== 0 && !readGroup(parent)) {
      throw new Error(`parent group ${parent} not found`)
    }
    if (wouldCreateCycle(id, parent)) {
      throw new Error('cannot move group under itself or a descendant')
    }

    getStmts().updateGroup.run(parent, name, id)

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
    const del = getStmts().deleteGroupById
    const tx = getDb().transaction(() => {
      for (const gid of ids) del.run(gid)
    })
    tx()
    return true
  },

  listTargets(): Target[] {
    const rows = getStmts().selectAllTargets.all() as TargetRow[]
    return rows.map(r => mapTarget(r)!)
  },

  getTarget(id: number): Target | undefined {
    const row = getStmts().selectTargetById.get(id) as TargetRow | undefined
    return mapTarget(row)
  },

  getTargetCheckConfig(targetId: number, checkId: string): unknown | null {
    const row = getStmts().selectTargetCheckConfig.get(targetId, checkId) as
      TargetCheckConfigRow | undefined
    if (!row) return null
    return parseConfigJson(row.config_json)
  },

  listTargetCheckConfigs(
    checkId: string,
  ): Array<{targetId: number; config: unknown}> {
    const rows = getStmts().selectTargetCheckConfigsByCheck.all(
      checkId,
    ) as TargetCheckConfigListRow[]
    const out: Array<{targetId: number; config: unknown}> = []
    for (const row of rows) {
      const config = parseConfigJson(row.config_json)
      if (config === null) continue
      out.push({targetId: row.target_id, config})
    }
    return out
  },

  getTargetNotifierConfig(
    targetId: number,
    notifierId: string,
  ): unknown | null {
    const row = getStmts().selectTargetNotifierConfig.get(
      targetId,
      notifierId,
    ) as TargetNotifierConfigRow | undefined
    if (!row) return null
    return parseConfigJson(row.config_json)
  },

  listTargetNotifierConfigs(
    notifierId: string,
  ): Array<{targetId: number; config: unknown}> {
    const rows = getStmts().selectTargetNotifierConfigsByNotifier.all(
      notifierId,
    ) as TargetNotifierConfigListRow[]
    const out: Array<{targetId: number; config: unknown}> = []
    for (const row of rows) {
      const config = parseConfigJson(row.config_json)
      if (config === null) continue
      out.push({targetId: row.target_id, config})
    }
    return out
  },

  listAllTargetNotifierConfigs(): Array<{
    targetId: number
    notifierId: string
    config: unknown
  }> {
    const rows =
      getStmts().selectAllTargetNotifierConfigs.all() as TargetNotifierConfigAllRow[]
    const out: Array<{targetId: number; notifierId: string; config: unknown}> =
      []
    for (const row of rows) {
      const config = parseConfigJson(row.config_json)
      if (config === null) continue
      out.push({
        targetId: row.target_id,
        notifierId: row.notifier_id,
        config,
      })
    }
    return out
  },

  setTargetNotifierConfig(
    targetId: number,
    notifierId: string,
    config: unknown,
  ): void {
    if (!Number.isInteger(targetId) || targetId < 1) {
      throw new Error('target_id must be a positive integer')
    }
    if (typeof notifierId !== 'string' || !notifierId.trim()) {
      throw new Error('notifier_id is required')
    }
    const target = core.getTarget(targetId)
    if (!target) throw new Error(`target ${targetId} not found`)
    const normalizedNotifierId = notifierId.trim()
    getStmts().upsertTargetNotifierConfig.run(
      targetId,
      normalizedNotifierId,
      JSON.stringify(config),
    )
  },

  deleteTargetNotifierConfig(targetId: number, notifierId: string): void {
    getStmts().deleteTargetNotifierConfig.run(targetId, notifierId)
  },

  setTargetCheckConfig(
    targetId: number,
    checkId: string,
    config: unknown,
  ): void {
    if (!Number.isInteger(targetId) || targetId < 1) {
      throw new Error('target_id must be a positive integer')
    }
    if (typeof checkId !== 'string' || !checkId.trim()) {
      throw new Error('check_id is required')
    }
    const target = core.getTarget(targetId)
    if (!target) throw new Error(`target ${targetId} not found`)
    const normalizedCheckId = checkId.trim()
    getStmts().upsertTargetCheckConfig.run(
      targetId,
      normalizedCheckId,
      JSON.stringify(config),
    )
  },

  deleteTargetCheckConfig(targetId: number, checkId: string): void {
    getStmts().deleteTargetCheckConfig.run(targetId, checkId)
  },

  createTarget(
    url: string,
    intervalSeconds: number,
    enabled = true,
    groupId: number | null = null,
    checkIds: string[] = [],
    notifierIds: string[] = [],
  ): Target {
    assertChildGroupForTarget(groupId)
    const checks = normalizePluginIds(checkIds, 'check_ids')
    const notifiers = normalizePluginIds(notifierIds, 'notifier_ids')
    const result = getStmts().insertTarget.run(
      url,
      intervalSeconds,
      enabled ? 1 : 0,
      groupId,
      JSON.stringify(checks),
      JSON.stringify(notifiers),
    )
    const id = Number(result.lastInsertRowid)
    getStmts().insertTargetState.run(id)
    return core.getTarget(id)!
  },

  updateTarget(
    id: number,
    patch: Partial<{
      url: string
      interval_seconds: number
      enabled: boolean
      group_id: number | null
      check_ids: string[]
      notifier_ids: string[]
    }>,
  ): Target | undefined {
    const existing = core.getTarget(id)
    if (!existing) return undefined
    const url = patch.url ?? existing.url
    const interval = patch.interval_seconds ?? existing.interval_seconds
    const enabled =
      patch.enabled === undefined ? existing.enabled : patch.enabled ? 1 : 0
    const groupId =
      patch.group_id !== undefined ? patch.group_id : existing.group_id
    const checkIds =
      patch.check_ids !== undefined
        ? normalizePluginIds(patch.check_ids, 'check_ids')
        : existing.check_ids
    const notifierIds =
      patch.notifier_ids !== undefined
        ? normalizePluginIds(patch.notifier_ids, 'notifier_ids')
        : existing.notifier_ids
    assertChildGroupForTarget(groupId)
    getStmts().updateTarget.run(
      url,
      interval,
      enabled,
      groupId,
      JSON.stringify(checkIds),
      JSON.stringify(notifierIds),
      id,
    )
    return core.getTarget(id)
  },

  deleteTarget(id: number): boolean {
    const result = getStmts().deleteTargetById.run(id)
    return result.changes > 0
  },

  getTargetState(targetId: number): TargetState | undefined {
    return getStmts().selectTargetState.get(targetId) as TargetState | undefined
  },

  recordCheckResult(input: {
    targetId: number
    status: HealthStatus
    statusCode: number | null
    error: string | null
    latencyMs: number | null
  }): void {
    const s = getStmts()
    const code = healthToDb(input.status)
    s.insertCheckResult.run(
      input.targetId,
      code,
      input.statusCode,
      input.error,
      input.latencyMs,
    )
    s.upsertTargetState.run(
      input.targetId,
      code,
      input.statusCode,
      input.error,
      input.latencyMs,
    )
    s.pruneCheckResults.run(input.targetId, input.targetId)
  },

  markAlertSent(targetId: number): void {
    getStmts().markAlertSent.run(targetId)
  },

  listRecentResults(targetId: number, limit = 50): CheckResult[] {
    return getStmts().selectRecentResults.all(targetId, limit) as CheckResult[]
  },

  listIncidents(limit = 50) {
    const rows = getStmts().selectIncidentRows.all() as IncidentSourceRow[]
    return buildIncidents(rows, {limit})
  },

  getStatusSummary() {
    return getStmts().selectStatusSummary.all()
  },

  countUsers(): number {
    const row = getStmts().countUsers.get() as {n: number}
    return Number(row.n) || 0
  },

  listUsers(): User[] {
    return (getStmts().selectUsers.all() as UserRow[]).map(mapUser)
  },

  getUser(id: number): User | undefined {
    const row = getStmts().selectUserById.get(id) as UserRow | undefined
    return row ? mapUser(row) : undefined
  },

  getUserByUsername(username: string): User | undefined {
    const row = getStmts().selectUserByUsername.get(username) as
      UserRow | undefined
    return row ? mapUser(row) : undefined
  },

  getUserPasswordHash(id: number): string | undefined {
    const row = getStmts().selectUserPasswordHash.get(id) as
      {password_hash: string} | undefined
    return row?.password_hash
  },

  createUser(input: {
    username: string
    password: string
    role_id: number
  }): User {
    const username = normalizeUsername(input.username)
    assertPasswordPolicy(input.password)
    const role = core.getRole(input.role_id)
    if (!role) throw new Error('role not found')
    if (core.getUserByUsername(username)) {
      throw new Error('username already exists')
    }
    const result = getStmts().insertUser.run(
      username,
      hashPassword(input.password),
      input.role_id,
    )
    return core.getUser(Number(result.lastInsertRowid))!
  },

  updateUser(
    id: number,
    patch: Partial<{username: string; password: string; role_id: number}>,
  ): User | undefined {
    const existing = core.getUser(id)
    if (!existing) return undefined
    const passwordHash = core.getUserPasswordHash(id)
    if (!passwordHash) return undefined

    const username =
      patch.username !== undefined
        ? normalizeUsername(patch.username)
        : existing.username
    if (username !== existing.username && core.getUserByUsername(username)) {
      throw new Error('username already exists')
    }

    let nextHash = passwordHash
    if (patch.password !== undefined) {
      assertPasswordPolicy(patch.password)
      nextHash = hashPassword(patch.password)
    }

    const roleId = patch.role_id ?? existing.role_id
    if (!core.getRole(roleId)) throw new Error('role not found')

    getStmts().updateUser.run(username, nextHash, roleId, id)
    if (patch.password !== undefined) {
      core.deleteSessionsForUser(id)
    }
    return core.getUser(id)
  },

  deleteUser(id: number): boolean {
    const settings = core.getSettings()
    if (settings.auth_enabled && core.countUsers() <= 1) {
      throw new Error('Cannot delete the last user while auth is enabled')
    }
    const result = getStmts().deleteUserById.run(id)
    return result.changes > 0
  },

  listRoles(): Role[] {
    const rows = getStmts().selectRoles.all() as RoleRow[]
    return rows.map(mapRole)
  },

  getRole(id: number): Role | undefined {
    const row = getStmts().selectRoleById.get(id) as RoleRow | undefined
    return row ? mapRole(row) : undefined
  },

  getRoleBySlug(slug: string): Role | undefined {
    const row = getStmts().selectRoleBySlug.get(slug) as RoleRow | undefined
    return row ? mapRole(row) : undefined
  },

  createRole(input: {
    name: string
    can_write: boolean
    plugins: RolePluginRef[]
  }): Role {
    const name = normalizeRoleName(input.name)
    const slug = uniqueRoleSlug(slugify(name))
    const plugins = normalizeRolePlugins(input.plugins)
    const result = getStmts().insertRole.run(
      slug,
      name,
      input.can_write ? 1 : 0,
    )
    const id = Number(result.lastInsertRowid)
    replaceRolePlugins(id, plugins)
    return core.getRole(id)!
  },

  updateRole(
    id: number,
    patch: Partial<{
      name: string
      can_write: boolean
      plugins: RolePluginRef[]
    }>,
  ): Role | undefined {
    const existing = core.getRole(id)
    if (!existing) return undefined
    if (existing.is_system) {
      throw new Error('System roles cannot be modified')
    }
    const name =
      patch.name !== undefined ? normalizeRoleName(patch.name) : existing.name
    const canWrite =
      patch.can_write !== undefined ? patch.can_write : existing.can_write
    getStmts().updateRole.run(name, canWrite ? 1 : 0, id)
    if (patch.plugins !== undefined) {
      replaceRolePlugins(id, normalizeRolePlugins(patch.plugins))
    }
    return core.getRole(id)
  },

  deleteRole(id: number): boolean {
    const existing = core.getRole(id)
    if (!existing) return false
    if (existing.is_system) {
      throw new Error('System roles cannot be deleted')
    }
    const users = getStmts().countUsersWithRole.get(id) as {n: number}
    if (Number(users.n) > 0) {
      throw new Error('Cannot delete a role that is assigned to users')
    }
    const result = getStmts().deleteRoleById.run(id)
    return result.changes > 0
  },

  createSession(userId: number, tokenHash: string, expiresAtIso: string): void {
    getStmts().insertSession.run(userId, tokenHash, expiresAtIso)
  },

  deleteSessionByTokenHash(tokenHash: string): void {
    getStmts().deleteSessionByHash.run(tokenHash)
  },

  deleteSessionsForUser(userId: number): void {
    getStmts().deleteSessionsForUser.run(userId)
  },

  pruneExpiredSessions(): void {
    getStmts().pruneExpiredSessions.run()
  },

  resolveSessionPrincipal(rawToken: string): AuthPrincipal | null {
    core.pruneExpiredSessions()
    const tokenHash = hashSessionToken(rawToken)
    const row = getStmts().selectSessionByHash.get(tokenHash) as
      {user_id: number} | undefined
    if (!row) return null
    return core.principalForUser(row.user_id)
  },

  anonymousReadOnlyPrincipal(): AuthPrincipal {
    return {
      kind: 'anonymous',
      user: null,
      is_admin: false,
      can_write: false,
      plugins: 'all',
      single_user_mode: core.countUsers() === 1,
    }
  },

  principalForUser(userId: number): AuthPrincipal | null {
    const user = core.getUser(userId)
    if (!user) return null
    const role = core.getRole(user.role_id)
    if (!role) return null
    const singleUserMode = core.countUsers() === 1
    if (singleUserMode || role.slug === 'admin') {
      return {
        kind: 'user',
        user,
        is_admin: true,
        can_write: true,
        plugins: 'all',
        single_user_mode: singleUserMode,
      }
    }
    return {
      kind: 'user',
      user,
      is_admin: false,
      can_write: role.can_write,
      plugins: role.plugins,
      single_user_mode: false,
    }
  },
}

export function initCore(databasePath: string): void {
  closeCore()

  const resolved = path.resolve(databasePath)
  const dir = path.dirname(resolved)
  fs.mkdirSync(dir, {recursive: true})

  db = new Database(resolved)
  dbPath = resolved
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
      check_ids TEXT NOT NULL DEFAULT '[]',
      notifier_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS target_check_configs (
      target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      check_id TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_id, check_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_target_check_configs_target_check
      ON target_check_configs(target_id, check_id);

    CREATE TABLE IF NOT EXISTS target_notifier_configs (
      target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      notifier_id TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_id, notifier_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_target_notifier_configs_target_notifier
      ON target_notifier_configs(target_id, notifier_id);

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      can_write INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS role_plugins (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      UNIQUE(role_id, kind, plugin_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_plugins_role_kind_plugin
      ON role_plugins(role_id, kind, plugin_id);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `)

  ensureColumn(
    'targets',
    'group_id',
    'INTEGER REFERENCES groups(id) ON DELETE SET NULL',
  )
  ensureColumn('targets', 'check_ids', `TEXT NOT NULL DEFAULT '[]'`)
  ensureColumn('targets', 'notifier_ids', `TEXT NOT NULL DEFAULT '[]'`)

  stmts = buildStatements(db)

  const insertSetting = stmts.insertSettingIgnore
  insertSetting.run('alert_policy', 'state_change')
  insertSetting.run('throttle_minutes', '30')
  insertSetting.run('auth_enabled', '0')
  insertSetting.run('allow_readonly_without_auth', '0')

  const insertRole = stmts.insertRoleIgnore
  insertRole.run('admin', 'Admin', 1, 1)
  insertRole.run('read_only', 'Read only', 1, 0)

  console.log(`[core] sqlite=${resolved}`)
}

export function closeCore(): void {
  if (!db) return
  try {
    db.close()
  } catch {
    // ignore close errors during shutdown/re-init
  }
  db = undefined
  stmts = undefined
  dbPath = ''
}
