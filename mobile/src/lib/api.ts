import {
  getBearerToken,
  getChatOwnerKey,
  getSessionCookie,
  parseSetCookieHeader,
  setSessionCookie,
} from './storage'

export type AlertPolicy = 'state_change' | 'every_fail' | 'throttle'

export interface Target {
  id: number
  url: string
  interval_seconds: number
  enabled: number
  group_id: number | null
  check_ids: string[]
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

export interface Settings {
  alert_policy: AlertPolicy
  throttle_minutes: number
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
}

export interface AuthPolicy {
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

export interface AgentSettings {
  enabled: boolean
  provider: AgentLlmProvider
  model: string
  base_url: string | null
  has_api_key: boolean
  max_tool_rounds: number
  request_extras: Record<AgentLlmProvider, Record<string, unknown>>
  configured: boolean
  config_source: 'database' | 'environment' | 'none'
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

export interface FcmDestination {
  id: number
  fid: string
  label: string
  enabled: number
  created_at: string
  last_test_ok: number | null
  last_test_error: string | null
  last_tested_at: string | null
}

export interface StatusResponse {
  core: {engine: string}
  checks: PluginRef[]
  scheduler: PluginRef
  notifiers: NotifierStatus[]
  settings: Settings
  targets: StatusTarget[]
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

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export async function canonicalizeBaseUrl(baseUrl: string): Promise<string> {
  const candidates = [baseUrl]
  try {
    const u = new URL(baseUrl)
    if (u.protocol === 'http:') {
      candidates.push(baseUrl.replace(/^http:/i, 'https:'))
    }
  } catch {
    return baseUrl
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(joinUrl(candidate, '/api/health'), {redirect: 'follow'})
      if (!res.ok) continue
      const final = new URL(res.url)
      const basePath = final.pathname.replace(/\/api\/health\/?$/, '') || ''
      return `${final.origin}${basePath}`.replace(/\/+$/, '')
    } catch {
      continue
    }
  }
  return baseUrl
}

let baseUrl = ''

export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
  return baseUrl
}

async function authHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra)
  const [session, bearer] = await Promise.all([
    getSessionCookie(),
    getBearerToken(),
  ])
  if (session) headers.set('cookie', session)
  if (bearer) headers.set('authorization', `Bearer ${bearer}`)
  return headers
}

async function agentChatHeaders(): Promise<Headers> {
  const owner = await getChatOwnerKey()
  return authHeaders({'x-umpire-chat-owner': owner})
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new ApiError('Server not configured', 0, false)

  const headers = await authHeaders(init?.headers)
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(joinUrl(baseUrl, path), {...init, headers})
  } catch {
    throw new ApiError('API temporarily unavailable', 0, true)
  }

  if (path === '/api/auth/login' && res.ok) {
    const setCookie =
      res.headers.get('set-cookie') ?? res.headers.get('Set-Cookie')
    const cookie = parseSetCookieHeader(setCookie)
    if (cookie) await setSessionCookie(cookie)
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
  health: () => request<{ok: boolean}>('/api/health'),
  status: () => request<StatusResponse>('/api/status'),
  incidents: (limit = 50) =>
    request<Incident[]>(`/api/incidents?limit=${limit}`),
  checks: {
    list: () => request<PluginRef[]>('/api/checks'),
  },
  notifiers: {
    list: () => request<NotifierStatus[]>('/api/notifiers'),
  },
  groups: {
    list: () => request<Group[]>('/api/groups'),
    tree: () => request<GroupTreeNode[]>('/api/groups?tree=1'),
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
      list: async () => {
        const headers = await agentChatHeaders()
        return request<AgentChat[]>('/api/agent/chats', {headers})
      },
      create: async (title?: string) => {
        const headers = await agentChatHeaders()
        return request<AgentChat>('/api/agent/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify(title ? {title} : {}),
        })
      },
      get: async (id: string) => {
        const headers = await agentChatHeaders()
        return request<AgentChatWithMessages>(`/api/agent/chats/${id}`, {
          headers,
        })
      },
      rename: async (id: string, title: string) => {
        const headers = await agentChatHeaders()
        return request<AgentChat>(`/api/agent/chats/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({title}),
        })
      },
      remove: async (id: string) => {
        const headers = await agentChatHeaders()
        return request<{ok: boolean}>(`/api/agent/chats/${id}`, {
          method: 'DELETE',
          headers,
        })
      },
    },
    settings: {
      get: () => request<AgentSettings>('/api/agent/settings'),
      put: (data: Partial<AgentSettings & {api_key?: string}>) =>
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
  fcm: {
    register: (token: string, label?: string) =>
      request<FcmDestination>('/api/plugins/notify/fcm/tokens/register', {
        method: 'POST',
        body: JSON.stringify({token, label}),
      }),
  },
}

export function streamUrl(): string {
  return joinUrl(baseUrl, '/api/stream')
}

export function agentWsUrl(): string {
  const url = joinUrl(baseUrl, '/api/agent/ws')
  return url.replace(/^http/, 'ws')
}
