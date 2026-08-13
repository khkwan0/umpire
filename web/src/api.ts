export type AlertPolicy = 'state_change' | 'every_fail' | 'throttle'

export interface Target {
  id: number
  url: string
  interval_seconds: number
  enabled: number
  group_id: number | null
  /** Empty = all loaded checks */
  check_ids: string[]
  created_at: string
  updated_at: string
}

export interface Group {
  id: number
  parent: number
  name: string
  tag: string
  created_at: string
  updated_at: string
}

export interface GroupTreeNode extends Group {
  children: GroupTreeNode[]
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

export interface StatusTarget {
  id: number
  url: string
  interval_seconds: number
  enabled: number
  group_id: number | null
  group_tag?: string | null
  /** 1=up, 0=down, 2=partial, null=never checked */
  is_up: number | null
  last_checked_at: string | null
  last_status_code: number | null
  last_error: string | null
  last_latency_ms: number | null
  last_alert_at: string | null
}

export interface PluginRef {
  id: string
}

export interface NotifierStatus {
  id: string
  ready: boolean
}

export interface StatusResponse {
  core: { engine: string }
  checks: PluginRef[]
  scheduler: PluginRef
  notifiers: NotifierStatus[]
  settings: Settings
  targets: StatusTarget[]
}

export interface CheckResult {
  id: number
  target_id: number
  ok: number
  status_code: number | null
  error: string | null
  latency_ms: number | null
  checked_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || res.statusText)
  }
  return body as T
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),
  checks: {
    list: () => request<PluginRef[]>('/api/checks'),
  },
  groups: {
    list: () => request<Group[]>('/api/groups'),
    tree: () => request<GroupTreeNode[]>('/api/groups?tree=1'),
    get: (id: number) => request<Group>(`/api/groups/${id}`),
    create: (data: { parent?: number; name?: string; tag?: string }) =>
      request<Group>('/api/groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: number,
      data: Partial<{ parent: number; name: string; tag: string }>,
    ) =>
      request<Group>(`/api/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/groups/${id}`, { method: 'DELETE' }),
  },
  targets: {
    list: () => request<Target[]>('/api/targets'),
    create: (data: {
      url: string
      interval_seconds: number
      enabled?: boolean
      group_id?: number | null
      check_ids?: string[]
    }) =>
      request<Target>('/api/targets', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: number,
      data: Partial<{
        url: string
        interval_seconds: number
        enabled: boolean
        group_id: number | null
        check_ids: string[]
      }>,
    ) =>
      request<Target>(`/api/targets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/targets/${id}`, { method: 'DELETE' }),
    results: (id: number) =>
      request<CheckResult[]>(`/api/targets/${id}/results`),
  },
  tokens: {
    list: () => request<FcmToken[]>('/api/tokens'),
    create: (data: { token: string; label?: string }) =>
      request<FcmToken>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/tokens/${id}`, { method: 'DELETE' }),
  },
  settings: {
    get: () => request<Settings>('/api/settings'),
    put: (data: Partial<Settings>) =>
      request<Settings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
}
