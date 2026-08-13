export type AlertPolicy = 'state_change' | 'every_fail' | 'throttle'

/** Aggregated target health across all check plugins. */
export type HealthStatus = 'up' | 'down' | 'partial'

/** DB encoding for target_state.is_up / check_results.ok: 1=up, 0=down, 2=partial. */
export function healthToDb(status: HealthStatus): number {
  if (status === 'up') return 1
  if (status === 'partial') return 2
  return 0
}

export function healthFromDb(value: number | null | undefined): HealthStatus | null {
  if (value === null || value === undefined) return null
  if (value === 1) return 'up'
  if (value === 2) return 'partial'
  return 'down'
}

export interface Group {
  id: number
  /** 0 = root of a tree */
  parent: number
  name: string
  tag: string
  created_at: string
  updated_at: string
}

export interface GroupTreeNode extends Group {
  children: GroupTreeNode[]
}

export interface Target {
  id: number
  url: string
  interval_seconds: number
  enabled: number
  /** Child group this target belongs to; null if unassigned */
  group_id: number | null
  created_at: string
  updated_at: string
}

export interface FcmToken {
  id: number
  token: string
  label: string
  enabled: number
  created_at: string
}

export interface Settings {
  alert_policy: AlertPolicy
  throttle_minutes: number
}

export interface CheckResult {
  id: number
  target_id: number
  /** 1=up, 0=down, 2=partial */
  ok: number
  status_code: number | null
  error: string | null
  latency_ms: number | null
  checked_at: string
}

export interface TargetState {
  target_id: number
  /** 1=up, 0=down, 2=partial, null=never checked */
  is_up: number | null
  last_alert_at: string | null
  last_checked_at: string | null
  last_status_code: number | null
  last_error: string | null
  last_latency_ms: number | null
}

export interface CheckOutcome {
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}

export interface AggregatedCheck {
  status: HealthStatus
  statusCode: number | null
  error: string | null
  latencyMs: number
}

export interface AlertEvent {
  target: { id: number; url: string }
  status: HealthStatus
  previousStatus: HealthStatus | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
}

export interface NotifierPlugin {
  id: string
  init?(): void | Promise<void>
  isReady(): boolean
  notify(event: AlertEvent): Promise<void>
}

export interface CheckPlugin {
  id: string
  check(url: string): Promise<CheckOutcome>
}

export interface StorePlugin {
  id: string
  init(config: { databasePath: string }): void
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
  ): Target
  updateTarget(
    id: number,
    patch: Partial<{
      url: string
      interval_seconds: number
      enabled: boolean
      group_id: number | null
    }>,
  ): Target | undefined
  deleteTarget(id: number): boolean
  listTokens(): FcmToken[]
  createToken(token: string, label?: string): FcmToken
  deleteToken(id: number): boolean
  enabledTokens(): string[]
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
}

export interface SchedulableTarget {
  id: number
  intervalSeconds: number
  enabled: boolean
}

export interface SchedulerContext {
  getTargets(): SchedulableTarget[]
  run(targetId: number): Promise<void>
}

export interface SchedulerPlugin {
  id: string
  init?(ctx: SchedulerContext): void
  start(): void
  stop(): void
  reschedule(): void
}
