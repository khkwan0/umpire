import {withBase} from './basePath'

export {withBase}

export type AlertPolicy = 'state_change' | 'every_fail' | 'throttle'

export interface Target {
  id: number
  url: string
  interval_seconds: number
  enabled: number
  group_id: number | null
  /** Empty = all loaded checks */
  check_ids: string[]
  /** Empty = all loaded notifiers */
  notifier_ids: string[]
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

export interface FcmDestination {
  id: number
  fid: string
  label: string
  enabled: number
  created_at: string
  /** 1=confirmed received, 2=FCM accepted, 0=error, null=never tested */
  last_test_ok: number | null
  last_test_error: string | null
  last_tested_at: string | null
}

export interface FcmDestinationTestResult {
  ok: boolean
  error: string | null
}

export interface FcmDestinationImportResult {
  created: FcmDestination[]
  skipped: Array<{fid: string; reason: string}>
}

export interface Settings {
  alert_policy: AlertPolicy
  throttle_minutes: number
  auth_enabled: boolean
  allow_readonly_without_auth: boolean
}

export type AuthPluginKind = 'check' | 'notify' | 'scheduler'

export interface RolePluginRef {
  kind: AuthPluginKind
  id: string
}

export interface Role {
  id: number
  slug: string
  name: string
  is_system: boolean
  can_write: boolean
  plugins: 'all' | RolePluginRef[]
  created_at: string
  updated_at: string
}

export interface User {
  id: number
  username: string
  role_id: number
  role_slug: string
  created_at: string
  updated_at: string
}

export interface AuthPrincipal {
  kind: 'anonymous' | 'user'
  user: User | null
  is_admin: boolean
  can_write: boolean
  plugins: 'all' | RolePluginRef[]
  single_user_mode: boolean
}

export interface AuthPolicy {
  auth_enabled: boolean
  allow_readonly_without_auth: boolean
  login_required: boolean
  user_count: number
}

export interface AuthMe {
  principal: AuthPrincipal
}

export interface AgentStatus {
  enabled: boolean
  configured: boolean
  provider: string | null
  model: string | null
}

export type AgentLlmProvider = 'openai' | 'anthropic' | 'ollama' | 'vllm'

export type AgentConfigSource = 'database' | 'environment' | 'none'

export interface AgentSettings {
  enabled: boolean
  provider: AgentLlmProvider
  model: string
  base_url: string | null
  has_api_key: boolean
  max_tool_rounds: number
  request_extras: Record<AgentLlmProvider, Record<string, unknown>>
  configured: boolean
  config_source: AgentConfigSource
}

export interface AgentChat {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface AgentChatToolRef {
  name: string
  summary?: string
}

export interface AgentChatMessage {
  id: string
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning: string | null
  tools: AgentChatToolRef[] | null
  created_at: string
}

export interface AgentChatWithMessages extends AgentChat {
  messages: AgentChatMessage[]
}

const CHAT_OWNER_STORAGE_KEY = 'umpire-agent-chat-owner'
const ACTIVE_CHAT_STORAGE_KEY = 'umpire-agent-active-chat'
const CHAT_OWNER_HEADER = 'x-umpire-chat-owner'

export function getAgentChatOwnerKey(): string {
  try {
    const existing = localStorage.getItem(CHAT_OWNER_STORAGE_KEY)
    if (existing && existing.length >= 8) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(CHAT_OWNER_STORAGE_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export function getStoredActiveChatId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredActiveChatId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, id)
    else localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY)
  } catch {
    // ignore storage errors
  }
}

function agentChatHeaders(): HeadersInit {
  return {[CHAT_OWNER_HEADER]: getAgentChatOwnerKey()}
}

/** Bearer token for MCP, agents, and automation (not FCM). */
export interface ApiToken {
  id: number
  user_id: number
  label: string
  token_prefix: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface ApiTokenCreated {
  token: string
  api_token: ApiToken
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

export interface CheckCompatibility {
  id: string
  compatible: boolean
  reason: string | null
}

export interface NotifierStatus {
  id: string
  ready: boolean
}

export interface PluginManagerEntry {
  id: string
  enabled: boolean
  /** Plugin-authored summary; null when the plugin did not provide one. */
  description: string | null
}

export interface PluginManagerNotifierEntry extends PluginManagerEntry {
  ready: boolean
}

export interface PluginManagerState {
  checks: PluginManagerEntry[]
  scheduler: PluginManagerEntry
  notifiers: PluginManagerNotifierEntry[]
}

export interface PluginRouteRef {
  method: string
  path: string
}

export interface PluginCatalogEntry {
  id: string
  kind: 'check' | 'scheduler' | 'notify'
  routes: PluginRouteRef[]
}

export interface HttpCheckConfig {
  method:
    | 'GET'
    | 'HEAD'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'OPTIONS'
    | 'TRACE'
    | 'CONNECT'
  headers: Record<string, string>
  body: string
  acceptedStatusRanges: Array<'1xx' | '2xx' | '3xx' | '4xx' | '5xx'>
  acceptedStatusCodes: number[]
  maxLatencyMs: number | null
}

export interface HttpCheckTargetConfigView {
  useCustom: boolean
  defaults: HttpCheckConfig
  override: HttpCheckConfig | null
  effective: HttpCheckConfig
}

export interface HttpCheckTargetConfigPut extends HttpCheckConfig {
  useCustom: boolean
}

export interface HttpCheckTestResult {
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}

export interface NotifierTargetConfigView {
  useCustom: boolean
  defaults: Record<string, unknown>
  override: Record<string, unknown> | null
  effective: Record<string, unknown>
}

export interface NotifierTestResult {
  ok: boolean
  error: string | null
}

export const CONFIGURABLE_NOTIFIERS = [
  'webhook',
  'slack',
  'discord',
  'telegram',
  'email',
  'fcm',
] as const

export type ConfigurableNotifierId = (typeof CONFIGURABLE_NOTIFIERS)[number]

export function isConfigurableNotifier(
  id: string,
): id is ConfigurableNotifierId {
  return (CONFIGURABLE_NOTIFIERS as readonly string[]).includes(id)
}

export interface StatusResponse {
  core: {engine: string}
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

export interface Incident {
  id: number
  target_id: number
  url: string
  group_tag: string | null
  status: 'down' | 'partial'
  recovered: boolean
  started_at: string
  recovered_at: string | null
  duration_seconds: number | null
  error: string | null
  status_code: number | null
}

export class ApiError extends Error {
  readonly status: number
  readonly transient: boolean

  constructor(message: string, status: number, transient: boolean) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.transient = transient
  }
}

function isTransientStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 429
}

function apiErrorMessage(status: number, bodyError?: string): string {
  if (bodyError) return bodyError
  if (isTransientStatus(status)) return 'API temporarily unavailable'
  if (status >= 500) return 'Server error'
  return 'Request failed'
}

export function isTransientApiError(err: unknown): boolean {
  return err instanceof ApiError && err.transient
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  let res: Response
  try {
    res = await fetch(withBase(path), {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError('API temporarily unavailable', 0, true)
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = apiErrorMessage(
      res.status,
      (body as {error?: string}).error,
    )
    throw new ApiError(message, res.status, isTransientStatus(res.status))
  }
  return body as T
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),
  incidents: (limit = 50) =>
    request<Incident[]>(`/api/incidents?limit=${limit}`),
  plugins: {
    list: () => request<PluginCatalogEntry[]>('/api/plugins'),
  },
  checks: {
    list: () => request<PluginRef[]>('/api/checks'),
  },
  notifiers: {
    list: () => request<NotifierStatus[]>('/api/notifiers'),
  },
  groups: {
    list: () => request<Group[]>('/api/groups'),
    tree: () => request<GroupTreeNode[]>('/api/groups?tree=1'),
    get: (id: number) => request<Group>(`/api/groups/${id}`),
    create: (data: {parent?: number; name?: string; tag?: string}) =>
      request<Group>('/api/groups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: Partial<{parent: number; name: string; tag: string}>,
    ) =>
      request<Group>(`/api/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/groups/${id}`, {method: 'DELETE'}),
  },
  targets: {
    list: () => request<Target[]>('/api/targets'),
    evaluateChecks: (data: {
      url: string
      interval_seconds?: number
      group_id?: number | null
    }) =>
      request<{checks: CheckCompatibility[]}>('/api/targets/evaluate-checks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    create: (data: {
      url: string
      interval_seconds: number
      enabled?: boolean
      group_id?: number | null
      check_ids?: string[]
      notifier_ids?: string[]
    }) =>
      request<Target>('/api/targets', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: Partial<{
        url: string
        interval_seconds: number
        enabled: boolean
        group_id: number | null
        check_ids: string[]
        notifier_ids: string[]
      }>,
    ) =>
      request<Target>(`/api/targets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/targets/${id}`, {method: 'DELETE'}),
    results: (id: number) =>
      request<CheckResult[]>(`/api/targets/${id}/results`),
    httpCheck: {
      getDefaults: () =>
        request<HttpCheckConfig>('/api/plugins/check/http/config'),
      putDefaults: (data: HttpCheckConfig) =>
        request<HttpCheckConfig>('/api/plugins/check/http/config', {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      listOverrides: () =>
        request<{targetIds: number[]}>('/api/plugins/check/http/overrides'),
      getConfig: (id: number) =>
        request<HttpCheckTargetConfigView>(
          `/api/plugins/check/http/targets/${id}/config`,
        ),
      putConfig: (id: number, data: HttpCheckTargetConfigPut) =>
        request<HttpCheckTargetConfigView>(
          `/api/plugins/check/http/targets/${id}/config`,
          {
            method: 'PUT',
            body: JSON.stringify(data),
          },
        ),
      clearConfig: (id: number) =>
        request<HttpCheckTargetConfigView>(
          `/api/plugins/check/http/targets/${id}/config`,
          {method: 'DELETE'},
        ),
      test: (
        id: number,
        data: Partial<HttpCheckTargetConfigPut> & {url?: string},
      ) =>
        request<HttpCheckTestResult>(
          `/api/plugins/check/http/targets/${id}/test`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          },
        ),
    },
    notifier: {
      listCheckIds: () =>
        request<{items: Array<{notifierId: string; targetIds: number[]}>}>(
          '/api/notifiers/check-ids',
        ),
      getCheckIds: (notifierId: string, targetId: number) =>
        request<{check_ids: string[]}>(
          `/api/targets/${targetId}/notifiers/${notifierId}/check-ids`,
        ),
      putCheckIds: (notifierId: string, targetId: number, checkIds: string[]) =>
        request<{check_ids: string[]}>(
          `/api/targets/${targetId}/notifiers/${notifierId}/check-ids`,
          {
            method: 'PUT',
            body: JSON.stringify({check_ids: checkIds}),
          },
        ),
      listOverrides: (notifierId: string) =>
        request<{targetIds: number[]}>(
          `/api/plugins/notify/${notifierId}/overrides`,
        ),
      getConfig: (notifierId: string, targetId: number) =>
        request<NotifierTargetConfigView>(
          `/api/plugins/notify/${notifierId}/targets/${targetId}/config`,
        ),
      putConfig: (
        notifierId: string,
        targetId: number,
        data: Record<string, unknown>,
      ) =>
        request<NotifierTargetConfigView>(
          `/api/plugins/notify/${notifierId}/targets/${targetId}/config`,
          {
            method: 'PUT',
            body: JSON.stringify(data),
          },
        ),
      clearConfig: (notifierId: string, targetId: number) =>
        request<NotifierTargetConfigView>(
          `/api/plugins/notify/${notifierId}/targets/${targetId}/config`,
          {method: 'DELETE'},
        ),
      test: (
        notifierId: string,
        targetId: number,
        data?: Record<string, unknown>,
      ) =>
        request<NotifierTestResult>(
          `/api/plugins/notify/${notifierId}/targets/${targetId}/test`,
          {
            method: 'POST',
            body: JSON.stringify(data ?? {}),
          },
        ),
    },
  },
  tokens: {
    list: () => request<FcmDestination[]>('/api/plugins/notify/fcm/tokens'),
    create: (data: {fid: string; label?: string}) =>
      request<FcmDestination>('/api/plugins/notify/fcm/tokens', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: Partial<{fid: string; label: string; enabled: boolean}>,
    ) =>
      request<FcmDestination>(`/api/plugins/notify/fcm/tokens/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/plugins/notify/fcm/tokens/${id}`, {
        method: 'DELETE',
      }),
    test: (id: number) =>
      request<FcmDestination>(`/api/plugins/notify/fcm/tokens/${id}/test`, {
        method: 'POST',
      }),
    received: (id: number, received: boolean) =>
      request<FcmDestination>(`/api/plugins/notify/fcm/tokens/${id}/received`, {
        method: 'POST',
        body: JSON.stringify({received}),
      }),
    testRaw: (fid: string) =>
      request<FcmDestinationTestResult>('/api/plugins/notify/fcm/tokens/test', {
        method: 'POST',
        body: JSON.stringify({fid}),
      }),
    import: (data: unknown) =>
      request<FcmDestinationImportResult>(
        '/api/plugins/notify/fcm/tokens/import',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      ),
  },
  settings: {
    get: () => request<Settings>('/api/settings'),
    put: (data: Partial<Settings>) =>
      request<Settings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  auth: {
    policy: () => request<AuthPolicy>('/api/auth/policy'),
    me: () => request<AuthMe>('/api/auth/me'),
    login: (username: string, password: string) =>
      request<AuthMe>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({username, password}),
      }),
    logout: () => request<{ok: boolean}>('/api/auth/logout', {method: 'POST'}),
  },
  agent: {
    status: () => request<AgentStatus>('/api/agent/status'),
    chats: {
      list: () =>
        request<AgentChat[]>('/api/agent/chats', {headers: agentChatHeaders()}),
      create: (title?: string) =>
        request<AgentChat>('/api/agent/chats', {
          method: 'POST',
          headers: agentChatHeaders(),
          body: JSON.stringify(title ? {title} : {}),
        }),
      get: (id: string) =>
        request<AgentChatWithMessages>(`/api/agent/chats/${id}`, {
          headers: agentChatHeaders(),
        }),
      rename: (id: string, title: string) =>
        request<AgentChat>(`/api/agent/chats/${id}`, {
          method: 'PATCH',
          headers: agentChatHeaders(),
          body: JSON.stringify({title}),
        }),
      remove: (id: string) =>
        request<{ok: boolean}>(`/api/agent/chats/${id}`, {
          method: 'DELETE',
          headers: agentChatHeaders(),
        }),
    },
    settings: {
      get: () => request<AgentSettings>('/api/agent/settings'),
      put: (data: {
        enabled?: boolean
        provider?: AgentLlmProvider
        model?: string
        base_url?: string | null
        api_key?: string
        max_tool_rounds?: number
        request_extras?: Record<AgentLlmProvider, Record<string, unknown>>
      }) =>
        request<AgentSettings>('/api/agent/settings', {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
    },
  },
  apiTokens: {
    list: () => request<ApiToken[]>('/api/tokens'),
    create: (data: {label?: string; expires_in_days?: number | null}) =>
      request<ApiTokenCreated>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<{ok: boolean}>(`/api/tokens/${id}`, {method: 'DELETE'}),
  },
  users: {
    list: () => request<User[]>('/api/users'),
    create: (data: {username: string; password: string; role_id: number}) =>
      request<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: Partial<{username: string; password: string; role_id: number}>,
    ) =>
      request<User>(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/users/${id}`, {method: 'DELETE'}),
  },
  roles: {
    list: () => request<Role[]>('/api/roles'),
    create: (data: {
      name: string
      can_write: boolean
      plugins: RolePluginRef[]
    }) =>
      request<Role>('/api/roles', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: Partial<{
        name: string
        can_write: boolean
        plugins: RolePluginRef[]
      }>,
    ) =>
      request<Role>(`/api/roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/roles/${id}`, {method: 'DELETE'}),
  },
  pluginManager: {
    get: () => request<PluginManagerState>('/api/plugin-manager'),
    setEnabled: (
      kind: 'check' | 'notify' | 'scheduler',
      id: string,
      enabled: boolean,
    ) =>
      request<{ok: boolean}>(`/api/plugin-manager/${kind}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({enabled}),
      }),
  },
}
