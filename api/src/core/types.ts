import type {Incident} from '../incidents.js'
import type {AgentSettingsUpdate} from '../agent/settings-store.js'
import type {
  AgentChat,
  AgentChatMessage,
  AgentChatToolRef,
  AgentChatWithMessages,
  ApiToken,
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
import type {StoredAgentSettings} from 'umpire-agent'
import type {CoreTableDef} from './schema.js'

/** Core persistence API — SQLite only; not a plugin. */
export interface CoreStore {
  getSettings(): Settings
  updateSettings(partial: Partial<Settings>): Settings
  getStoredAgentSettings(): StoredAgentSettings | null
  updateStoredAgentSettings(partial: AgentSettingsUpdate): StoredAgentSettings
  listGroups(): Group[]
  listGroupTree(): GroupTreeNode[]
  getGroup(id: number): Group | undefined
  createGroup(input: {parent?: number; name?: string; tag?: string}): Group
  updateGroup(
    id: number,
    patch: Partial<{parent: number; name: string; tag: string}>,
  ): Group | undefined
  deleteGroup(id: number): boolean
  listTargets(): Target[]
  getTarget(id: number): Target | undefined
  getTargetCheckConfig(targetId: number, checkId: string): unknown | null
  listTargetCheckConfigs(
    checkId: string,
  ): Array<{targetId: number; config: unknown}>
  getTargetNotifierConfig(targetId: number, notifierId: string): unknown | null
  listTargetNotifierConfigs(
    notifierId: string,
  ): Array<{targetId: number; config: unknown}>
  listAllTargetNotifierConfigs(): Array<{
    targetId: number
    notifierId: string
    config: unknown
  }>
  setTargetNotifierConfig(
    targetId: number,
    notifierId: string,
    config: unknown,
  ): void
  deleteTargetNotifierConfig(targetId: number, notifierId: string): void
  setTargetCheckConfig(targetId: number, checkId: string, config: unknown): void
  deleteTargetCheckConfig(targetId: number, checkId: string): void
  createTarget(
    url: string,
    intervalSeconds: number,
    enabled?: boolean,
    groupId?: number | null,
    checkIds?: string[],
    notifierIds?: string[],
  ): Target
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
  ): Target | undefined
  deleteTarget(id: number): boolean
  getTargetState(targetId: number): TargetState | undefined
  recordCheckResult(input: {
    targetId: number
    status: HealthStatus
    statusCode: number | null
    error: string | null
    latencyMs: number | null
  }): void
  markAlertSent(targetId: number): void
  listRecentResults(targetId: number, limit?: number): CheckResult[]
  /** Outage windows (including recoveries), newest activity first. */
  listIncidents(limit?: number): Incident[]
  getStatusSummary(): unknown[]
  /** Absolute path to the SQLite file. */
  databasePath(): string
  /** Directory for core + plugin sidecar files. */
  dataDir(): string
  schema(): CoreTableDef[]
  /** Snapshot of all core table rows (for GET /api/schema?data=1). */
  dumpData(): Record<string, unknown[]>

  countUsers(): number
  bootstrapAdmin(username: string, password: string): User
  ensureAuthEnabled(): void
  listUsers(): User[]
  getUser(id: number): User | undefined
  getUserByUsername(username: string): User | undefined
  createUser(input: {username: string; password: string; role_id: number}): User
  updateUser(
    id: number,
    patch: Partial<{username: string; password: string; role_id: number}>,
  ): User | undefined
  deleteUser(id: number): boolean
  getUserPasswordHash(id: number): string | undefined

  listRoles(): Role[]
  getRole(id: number): Role | undefined
  getRoleBySlug(slug: string): Role | undefined
  createRole(input: {
    name: string
    can_write: boolean
    plugins: RolePluginRef[]
  }): Role
  updateRole(
    id: number,
    patch: Partial<{
      name: string
      can_write: boolean
      plugins: RolePluginRef[]
    }>,
  ): Role | undefined
  deleteRole(id: number): boolean

  createSession(userId: number, tokenHash: string, expiresAtIso: string): void
  deleteSessionByTokenHash(tokenHash: string): void
  deleteSessionsForUser(userId: number): void
  pruneExpiredSessions(): void
  resolveSessionPrincipal(rawToken: string): AuthPrincipal | null
  createApiToken(input: {
    userId: number
    label: string
    tokenHash: string
    tokenPrefix: string
    expiresAt: string | null
  }): ApiToken
  listApiTokens(userId?: number): ApiToken[]
  getApiToken(id: number): ApiToken | undefined
  deleteApiToken(id: number): boolean
  pruneExpiredApiTokens(): void
  resolveApiTokenPrincipal(rawToken: string): AuthPrincipal | null
  anonymousReadOnlyPrincipal(): AuthPrincipal
  principalForUser(userId: number): AuthPrincipal | null

  listAgentChats(userId: number | null, ownerKey: string | null): AgentChat[]
  getAgentChat(
    id: string,
    userId: number | null,
    ownerKey: string | null,
  ): AgentChatWithMessages | undefined
  createAgentChat(
    userId: number | null,
    ownerKey: string | null,
    title?: string,
  ): AgentChat
  updateAgentChat(
    id: string,
    userId: number | null,
    ownerKey: string | null,
    patch: Partial<{title: string}>,
  ): AgentChat | undefined
  deleteAgentChat(
    id: string,
    userId: number | null,
    ownerKey: string | null,
  ): boolean
  appendAgentChatMessages(
    id: string,
    userId: number | null,
    ownerKey: string | null,
    messages: Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      reasoning?: string | null
      tools?: AgentChatToolRef[] | null
    }>,
  ): void
  getAgentChatLlmHistory(
    id: string,
    userId: number | null,
    ownerKey: string | null,
    limit?: number,
  ): Array<{role: 'user' | 'assistant'; content: string}>
}
