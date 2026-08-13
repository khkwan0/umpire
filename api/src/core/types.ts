import type {
  CheckResult,
  Group,
  GroupTreeNode,
  HealthStatus,
  Settings,
  Target,
  TargetState,
} from '../plugins/types.js'
import type { CoreTableDef } from './schema.js'

/** Core persistence API — SQLite only; not a plugin. */
export interface CoreStore {
  getSettings(): Settings
  updateSettings(partial: Partial<Settings>): Settings
  listGroups(): Group[]
  listGroupTree(): GroupTreeNode[]
  getGroup(id: number): Group | undefined
  createGroup(input: { parent?: number; name?: string; tag?: string }): Group
  updateGroup(
    id: number,
    patch: Partial<{ parent: number; name: string; tag: string }>,
  ): Group | undefined
  deleteGroup(id: number): boolean
  listTargets(): Target[]
  getTarget(id: number): Target | undefined
  createTarget(
    url: string,
    intervalSeconds: number,
    enabled?: boolean,
    groupId?: number | null,
    checkIds?: string[],
  ): Target
  updateTarget(
    id: number,
    patch: Partial<{
      url: string
      interval_seconds: number
      enabled: boolean
      group_id: number | null
      check_ids: string[]
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
  getStatusSummary(): unknown[]
  /** Absolute path to the SQLite file. */
  databasePath(): string
  /** Directory for core + plugin sidecar files. */
  dataDir(): string
  schema(): CoreTableDef[]
  /** Snapshot of all core table rows (for GET /api/schema?data=1). */
  dumpData(): Record<string, unknown[]>
}
