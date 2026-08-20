import type {FastifyInstance} from 'fastify'

export type AlertPolicy = 'state_change' | 'every_fail' | 'throttle'

/** Aggregated target health across all check plugins. */
export type HealthStatus = 'up' | 'down' | 'partial'

/** DB encoding for target_state.is_up / check_results.ok: 1=up, 0=down, 2=partial. */
export function healthToDb(status: HealthStatus): number {
  if (status === 'up') return 1
  if (status === 'partial') return 2
  return 0
}

export function healthFromDb(
  value: number | null | undefined,
): HealthStatus | null {
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
  /**
   * Check plugin ids to run for this target.
   * Empty array = all loaded checks.
   */
  check_ids: string[]
  /**
   * Notifier plugin ids to use for this target's alerts.
   * Empty array = all loaded notifiers.
   */
  notifier_ids: string[]
  created_at: string
  updated_at: string
}

export interface FcmToken {
  id: number
  fid: string
  label: string
  enabled: number
  created_at: string
  /** 1=confirmed received, 2=FCM accepted (not confirmed), 0=error, null=never tested */
  last_test_ok: number | null
  last_test_error: string | null
  last_tested_at: string | null
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

export interface CheckContext {
  target: Target
  config: unknown
}

/** Per-check result attached to aggregated runs and AlertEvent. */
export interface AlertCheckOutcome {
  id: string
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
  /** Checks that ran this cycle; empty if none ran. */
  checks: AlertCheckOutcome[]
}

export interface AlertEvent {
  target: {id: number; url: string}
  status: HealthStatus
  previousStatus: HealthStatus | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
  /** Structured per-check outcomes for this run (empty if none ran). */
  checks: AlertCheckOutcome[]
}

export interface NotifyContext {
  event: AlertEvent
  /**
   * Stored per-target override JSON, or null when using defaults only.
   * Core reads `check_ids` from this object before calling notify().
   */
  config: unknown
}

/** Identity every plugin declares. Description copy lives on the plugin, not in core. */
export interface PluginInfo {
  id: string
  /** Optional short summary of what this plugin does. */
  description?: string
}

export interface NotifierPlugin extends PluginInfo {
  init?(): void | Promise<void>
  isReady(): boolean
  notify(ctx: NotifyContext): Promise<void>
  /** Optional HTTP routes under /api/plugins/<kind>/<id>/… (host applies the prefix). */
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}

export interface CheckPlugin extends PluginInfo {
  check(ctx: CheckContext): Promise<CheckOutcome>
  /** Optional HTTP routes under /api/plugins/<kind>/<id>/… (host applies the prefix). */
  registerRoutes?(app: FastifyInstance): void | Promise<void>
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

export interface SchedulerPlugin extends PluginInfo {
  init?(ctx: SchedulerContext): void
  start(): void
  stop(): void
  reschedule(): void
  /** Optional HTTP routes under /api/plugins/<kind>/<id>/… (host applies the prefix). */
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}
