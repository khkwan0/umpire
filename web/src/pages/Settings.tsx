import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {
  api,
  isTransientApiError,
  type AlertPolicy,
  type AgentLlmProvider,
  type AgentSettings,
  type PluginManagerState,
  type Role,
  type RolePluginRef,
  type Settings,
  type User,
} from '../api'
import {useAuth} from '../auth'
import ReconnectBanner from '../ReconnectBanner'
import ThemeSwitcher from '../ThemeSwitcher'
import TimezoneSelect from '../TimezoneSelect'
import ApiTokensPanel from './ApiTokensPanel'
import {useOnboarding} from '../onboarding'

const MISSING_PLUGIN_DESCRIPTION =
  "No description offered by the plugin's author"

const AGENT_PROVIDER_OPTIONS: Array<{
  id: AgentLlmProvider
  label: string
  defaultBaseUrl: string | null
  defaultModel: string
  apiKeyRequired: boolean
  baseUrlHint: string
}> = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyRequired: true,
    baseUrlHint: 'OpenAI or compatible API base URL',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: null,
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyRequired: true,
    baseUrlHint: 'Anthropic uses a fixed API endpoint',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3.2',
    apiKeyRequired: false,
    baseUrlHint:
      'Ollama OpenAI-compatible URL (from Docker use http://host.docker.internal:11434/v1)',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    defaultModel: '',
    apiKeyRequired: false,
    baseUrlHint: 'vLLM OpenAI-compatible server base URL',
  },
]

function extrasToText(
  extras: Record<AgentLlmProvider, Record<string, unknown>> | undefined,
): Record<AgentLlmProvider, string> {
  const providers: AgentLlmProvider[] = [
    'openai',
    'anthropic',
    'ollama',
    'vllm',
  ]
  const out = {} as Record<AgentLlmProvider, string>
  for (const provider of providers) {
    out[provider] = JSON.stringify(extras?.[provider] ?? {}, null, 2)
  }
  return out
}

function parseExtrasText(
  raw: string,
  provider: AgentLlmProvider,
): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`Request JSON extras for ${provider} is not valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Request JSON extras for ${provider} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

const AGENT_EXTRAS_PLACEHOLDERS: Record<AgentLlmProvider, string> = {
  openai: '{"temperature": 0.2}',
  anthropic: '{"thinking": {"type": "enabled", "budget_tokens": 8000}}',
  ollama: '{"think": true}',
  vllm: '{"chat_template_kwargs": {"enable_thinking": true}}',
}

function agentProviderMeta(provider: AgentLlmProvider) {
  return (
    AGENT_PROVIDER_OPTIONS.find(option => option.id === provider) ??
    AGENT_PROVIDER_OPTIONS[0]!
  )
}

function displayedPluginDescription(
  description: string | null | undefined,
): string {
  const trimmed = description?.trim()
  return trimmed ? trimmed : MISSING_PLUGIN_DESCRIPTION
}

function PluginManagerRow({
  id,
  enabled,
  description,
  busy,
  extra,
  onToggle,
}: {
  id: string
  enabled: boolean
  description: string | null
  busy: boolean
  extra?: string
  onToggle: (enabled: boolean) => void
}) {
  return (
    <div className="plugin-manager-row">
      <label className="check-ids-item">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={e => onToggle(e.target.checked)}
        />
        {id}
        {extra}
      </label>
      <p className="muted small plugin-manager-description">
        {displayedPluginDescription(description)}
      </p>
    </div>
  )
}

function pluginKey(p: RolePluginRef): string {
  return `${p.kind}:${p.id}`
}

export default function SettingsPage() {
  const {restart} = useOnboarding()
  const {principal, policy, refresh: refreshAuth, logout} = useAuth()
  const isAdmin = Boolean(principal?.is_admin)
  const canWrite = Boolean(principal?.can_write)
  const signedIn = principal?.kind === 'user'

  const [settings, setSettings] = useState<Settings | null>(null)
  const [policyAlert, setPolicyAlert] = useState<AlertPolicy>('state_change')
  const [throttle, setThrottle] = useState(30)
  const [ownCurrentPassword, setOwnCurrentPassword] = useState('')
  const [ownNewPassword, setOwnNewPassword] = useState('')
  const [changePasswordBusy, setChangePasswordBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [plugins, setPlugins] = useState<PluginManagerState | null>(null)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)
  const [allowReadonlyWithoutAuth, setAllowReadonlyWithoutAuth] =
    useState(false)
  const [authConfigBusy, setAuthConfigBusy] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newUserRoleId, setNewUserRoleId] = useState<number | ''>('')
  const [editUserId, setEditUserId] = useState<number | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editUserRoleId, setEditUserRoleId] = useState<number | ''>('')

  const [roleName, setRoleName] = useState('')
  const [roleCanWrite, setRoleCanWrite] = useState(false)
  const [rolePlugins, setRolePlugins] = useState<RolePluginRef[]>([])
  const [editRoleId, setEditRoleId] = useState<number | null>(null)

  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null)
  const [agentEnabled, setAgentEnabled] = useState(false)
  const [agentProvider, setAgentProvider] = useState<AgentLlmProvider>('openai')
  const [agentModel, setAgentModel] = useState('gpt-4o-mini')
  const [agentBaseUrl, setAgentBaseUrl] = useState('')
  const [agentApiKey, setAgentApiKey] = useState('')
  const [agentMaxToolRounds, setAgentMaxToolRounds] = useState(12)
  const [agentHasApiKey, setAgentHasApiKey] = useState(false)
  const [agentRequestExtras, setAgentRequestExtras] = useState<
    Record<AgentLlmProvider, string>
  >(extrasToText(undefined))
  const [agentBusy, setAgentBusy] = useState(false)

  const agentMeta = useMemo(
    () => agentProviderMeta(agentProvider),
    [agentProvider],
  )

  const availablePlugins = useMemo(() => {
    if (!plugins) return [] as RolePluginRef[]
    const list: RolePluginRef[] = [
      {kind: 'scheduler', id: plugins.scheduler.id},
      ...plugins.checks.map(c => ({kind: 'check' as const, id: c.id})),
      ...plugins.notifiers.map(n => ({kind: 'notify' as const, id: n.id})),
    ]
    return list
  }, [plugins])

  async function loadAdminLists() {
    if (!isAdmin) {
      setUsers([])
      setRoles([])
      return
    }
    const [u, r] = await Promise.all([api.users.list(), api.roles.list()])
    setUsers(u)
    setRoles(r)
    if (newUserRoleId === '' && r.length > 0) {
      const admin = r.find(role => role.slug === 'admin')
      setNewUserRoleId(admin?.id ?? r[0]!.id)
    }
  }

  function applyAgentSettings(next: AgentSettings) {
    setAgentSettings(next)
    setAgentEnabled(next.enabled)
    setAgentProvider(next.provider)
    setAgentModel(next.model)
    setAgentBaseUrl(next.base_url ?? '')
    setAgentHasApiKey(next.has_api_key)
    setAgentMaxToolRounds(next.max_tool_rounds)
    setAgentRequestExtras(extrasToText(next.request_extras))
    setAgentApiKey('')
  }

  const loadAgentSettings = useCallback(async () => {
    if (!isAdmin) {
      setAgentSettings(null)
      return
    }
    const next = await api.agent.settings.get()
    applyAgentSettings(next)
  }, [isAdmin])

  useEffect(() => {
    void Promise.all([api.settings.get(), api.pluginManager.get()])
      .then(async ([s, p]) => {
        setSettings(s)
        setPolicyAlert(s.alert_policy)
        setThrottle(s.throttle_minutes)
        setPlugins(p)
        setError(null)
        setReconnecting(false)
        if (principal?.is_admin) {
          const [u, r] = await Promise.all([api.users.list(), api.roles.list()])
          setUsers(u)
          setRoles(r)
          const admin = r.find(role => role.slug === 'admin')
          setNewUserRoleId(admin?.id ?? r[0]?.id ?? '')
          await loadAgentSettings()
        }
      })
      .catch(err => {
        if (isTransientApiError(err)) {
          setReconnecting(true)
          return
        }
        setError(err instanceof Error ? err.message : String(err))
        setReconnecting(false)
      })
  }, [loadAgentSettings, policy, principal?.is_admin])

  useEffect(() => {
    if (policy?.auth_enabled) {
      setAllowReadonlyWithoutAuth(policy.allow_readonly_without_auth)
    }
  }, [policy])

  async function onSaveAuthConfig() {
    if (!isAdmin || !policy?.auth_enabled) return
    setAuthConfigBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.auth.rbacConfig.put(allowReadonlyWithoutAuth)
      setMessage('Authentication settings saved')
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAuthConfigBusy(false)
    }
  }

  async function togglePlugin(
    kind: 'auth' | 'check' | 'notify' | 'scheduler',
    id: string,
    enabled: boolean,
  ) {
    const key = `${kind}:${id}`
    setPluginBusy(key)
    setError(null)
    setMessage(null)
    try {
      await api.pluginManager.setEnabled(kind, id, enabled)
      const next = await api.pluginManager.get()
      setPlugins(next)
      if (kind === 'auth') {
        await refreshAuth()
        setMessage(
          enabled
            ? 'Auth enabled'
            : 'Auth disabled — open mode is active',
        )
      } else {
        setMessage('Plugin state updated')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPluginBusy(null)
    }
  }

  async function onSaveAlert(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await api.settings.put({
        alert_policy: policyAlert,
        throttle_minutes: throttle,
      })
      setSettings(next)
      setMessage('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    setChangePasswordBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.auth.changePassword(ownCurrentPassword, ownNewPassword)
      setOwnCurrentPassword('')
      setOwnNewPassword('')
      setMessage('Password changed')
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChangePasswordBusy(false)
    }
  }

  async function onSaveAgent(e: FormEvent) {
    e.preventDefault()
    setAgentBusy(true)
    setError(null)
    setMessage(null)
    try {
      const patch: {
        enabled: boolean
        provider: AgentLlmProvider
        model: string
        base_url: string | null
        max_tool_rounds: number
        api_key?: string
        request_extras: Record<AgentLlmProvider, Record<string, unknown>>
      } = {
        enabled: agentEnabled,
        provider: agentProvider,
        model: agentModel.trim(),
        base_url:
          agentProvider === 'anthropic' ? null : agentBaseUrl.trim() || null,
        max_tool_rounds: agentMaxToolRounds,
        request_extras: {
          openai: parseExtrasText(agentRequestExtras.openai, 'openai'),
          anthropic: parseExtrasText(agentRequestExtras.anthropic, 'anthropic'),
          ollama: parseExtrasText(agentRequestExtras.ollama, 'ollama'),
          vllm: parseExtrasText(agentRequestExtras.vllm, 'vllm'),
        },
      }
      if (agentApiKey.trim()) {
        patch.api_key = agentApiKey.trim()
      }
      const next = await api.agent.settings.put(patch)
      applyAgentSettings(next)
      setMessage('AI agent settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAgentBusy(false)
    }
  }

  function onAgentProviderChange(provider: AgentLlmProvider) {
    const meta = agentProviderMeta(provider)
    setAgentProvider(provider)
    setAgentModel(meta.defaultModel)
    setAgentBaseUrl(meta.defaultBaseUrl ?? '')
  }

  async function createUser(e: FormEvent) {
    e.preventDefault()
    if (newUserRoleId === '') return
    setError(null)
    setMessage(null)
    try {
      await api.users.create({
        username: newUsername,
        password: newPassword,
        role_id: newUserRoleId,
      })
      setNewUsername('')
      setNewPassword('')
      setMessage('User created')
      await loadAdminLists()
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault()
    if (editUserId == null || editUserRoleId === '') return
    setError(null)
    setMessage(null)
    try {
      const patch: Partial<{
        username: string
        password: string
        role_id: number
      }> = {
        username: editUsername,
        role_id: editUserRoleId,
      }
      if (editPassword) patch.password = editPassword
      await api.users.update(editUserId, patch)
      setEditUserId(null)
      setEditPassword('')
      setMessage('User updated')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeUser(id: number) {
    setError(null)
    setMessage(null)
    try {
      await api.users.remove(id)
      setMessage('User deleted')
      await loadAdminLists()
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleRolePlugin(ref: RolePluginRef) {
    setRolePlugins(prev => {
      const key = pluginKey(ref)
      if (prev.some(p => pluginKey(p) === key)) {
        return prev.filter(p => pluginKey(p) !== key)
      }
      return [...prev, ref]
    })
  }

  async function createRole(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await api.roles.create({
        name: roleName,
        can_write: roleCanWrite,
        plugins: rolePlugins,
      })
      setRoleName('')
      setRoleCanWrite(false)
      setRolePlugins([])
      setMessage('Role created')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault()
    if (editRoleId == null) return
    setError(null)
    setMessage(null)
    try {
      await api.roles.update(editRoleId, {
        name: roleName,
        can_write: roleCanWrite,
        plugins: rolePlugins,
      })
      setEditRoleId(null)
      setRoleName('')
      setRoleCanWrite(false)
      setRolePlugins([])
      setMessage('Role updated')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeRole(id: number) {
    setError(null)
    setMessage(null)
    try {
      await api.roles.remove(id)
      setMessage('Role deleted')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function startEditRole(role: Role) {
    setEditRoleId(role.id)
    setRoleName(role.name)
    setRoleCanWrite(role.can_write)
    setRolePlugins(role.plugins === 'all' ? [] : [...role.plugins])
  }

  function cancelEditRole() {
    setEditRoleId(null)
    setRoleName('')
    setRoleCanWrite(false)
    setRolePlugins([])
  }

  if (!settings && !error && !reconnecting)
    return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      {reconnecting && <ReconnectBanner />}
      <section className="panel">
        <h2 id="appearance-heading">Appearance</h2>
        <p className="muted small">
          Theme and timezone preferences apply to the whole dashboard, including
          plugin pages. Timestamps from the API are stored in UTC.
        </p>
        <ThemeSwitcher labelledBy="appearance-heading" />
        <TimezoneSelect labelledBy="appearance-heading" />
      </section>
      <section className="panel">
        <h2>Setup tutorial</h2>
        <p className="muted small">
          Replay the first-run walkthrough for adding a target and a notifier,
          even if you skipped or finished it.
        </p>
        <button type="button" onClick={restart}>
          Rerun tutorial
        </button>
      </section>
      <section className="panel">
        <h2>Alert policy</h2>
        <form className="form-col" onSubmit={onSaveAlert}>
          <label>
            Policy
            <select
              value={policyAlert}
              onChange={e => setPolicyAlert(e.target.value as AlertPolicy)}
              disabled={!isAdmin}
            >
              <option value="state_change">
                State change (down once, recover once)
              </option>
              <option value="every_fail">Every failed check</option>
              <option value="throttle">
                Throttle (first fail, then at most every N minutes)
              </option>
            </select>
          </label>
          <label>
            Throttle minutes
            <input
              type="number"
              min={1}
              value={throttle}
              onChange={e => setThrottle(Number(e.target.value))}
              disabled={policyAlert !== 'throttle' || !isAdmin}
            />
          </label>
          <button type="submit" disabled={busy || !isAdmin}>
            Save
          </button>
        </form>
      </section>

      {policy?.auth_enabled && (
        <section className="panel">
          <h2>Account</h2>
          {signedIn ? (
            <>
              <p className="muted small">
                Signed in as <strong>{principal?.user?.username}</strong>
                {principal?.is_admin ? ' (admin)' : ''}.
              </p>
              <button type="button" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="muted small">
                Sign in for write access. You can also authenticate without the
                UI: <code>POST /api/auth/login</code> sets a session cookie;
                create a Bearer token with <code>POST /api/tokens</code> after
                logging in. See <code>docs/api.md</code>.
              </p>
              <Link to="/login">Sign in</Link>
            </>
          )}
        </section>
      )}

      {policy?.auth_enabled && isAdmin && (
        <section className="panel">
          <h2>Authentication</h2>
          <p className="muted small">
            Control whether visitors can browse the dashboard without signing
            in. Write access always requires a signed-in account.
          </p>
          <div className="form-col">
            <label className="check-ids-item">
              <input
                type="checkbox"
                checked={allowReadonlyWithoutAuth}
                onChange={e => setAllowReadonlyWithoutAuth(e.target.checked)}
              />
              Allow read-only access without signing in
            </label>
            <button
              type="button"
              onClick={() => void onSaveAuthConfig()}
              disabled={authConfigBusy}
            >
              {authConfigBusy ? 'Saving…' : 'Save authentication settings'}
            </button>
          </div>
        </section>
      )}

      {signedIn && (
        <section className="panel">
          <h2>Change password</h2>
          <p className="muted small">
            Update the password for your account ({principal?.user?.username}).
          </p>
          <form className="form-col" onSubmit={onChangePassword}>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={ownCurrentPassword}
                onChange={e => setOwnCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={ownNewPassword}
                onChange={e => setOwnNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <button type="submit" disabled={changePasswordBusy}>
              {changePasswordBusy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </section>
      )}

      <ApiTokensPanel signedIn={signedIn} isAdmin={isAdmin} users={users} />

      {isAdmin && (
        <section className="panel">
          <h2>AI Agent</h2>
          <p className="muted small">
            Configure the monitoring assistant used by the Agent chat page.
            Supports OpenAI, Anthropic, Ollama, and vLLM (OpenAI-compatible).
            {agentSettings?.config_source === 'environment' && (
              <>
                {' '}
                Currently using environment variables until you save settings
                here.
              </>
            )}
          </p>
          <form className="form-col" onSubmit={onSaveAgent}>
            <label className="check-ids-item">
              <input
                type="checkbox"
                checked={agentEnabled}
                onChange={e => setAgentEnabled(e.target.checked)}
              />
              Enable AI agent
            </label>
            <label>
              Provider
              <select
                value={agentProvider}
                onChange={e =>
                  onAgentProviderChange(e.target.value as AgentLlmProvider)
                }
              >
                {AGENT_PROVIDER_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              <input
                value={agentModel}
                onChange={e => setAgentModel(e.target.value)}
                placeholder={agentMeta.defaultModel || 'Model name'}
                required={agentEnabled}
              />
            </label>
            {agentProvider !== 'anthropic' && (
              <label>
                Base URL
                <input
                  value={agentBaseUrl}
                  onChange={e => setAgentBaseUrl(e.target.value)}
                  placeholder={agentMeta.defaultBaseUrl ?? ''}
                />
                <span className="muted small">{agentMeta.baseUrlHint}</span>
              </label>
            )}
            <label>
              API key
              <input
                type="password"
                value={agentApiKey}
                onChange={e => setAgentApiKey(e.target.value)}
                placeholder={
                  agentHasApiKey
                    ? 'Saved — enter a new key to replace'
                    : agentMeta.apiKeyRequired
                      ? 'Required for this provider'
                      : 'Optional'
                }
                autoComplete="off"
              />
            </label>
            <label>
              Max tool rounds
              <input
                type="number"
                min={1}
                max={20}
                value={agentMaxToolRounds}
                onChange={e => setAgentMaxToolRounds(Number(e.target.value))}
              />
            </label>
            <label>
              Request JSON extras ({agentMeta.label})
              <textarea
                className="agent-extras-json"
                value={agentRequestExtras[agentProvider]}
                onChange={e =>
                  setAgentRequestExtras(prev => ({
                    ...prev,
                    [agentProvider]: e.target.value,
                  }))
                }
                placeholder={AGENT_EXTRAS_PLACEHOLDERS[agentProvider]}
                spellCheck={false}
                rows={8}
              />
              <span className="muted small">
                Merged into the {agentMeta.label} chat request. Cannot override
                messages, tools, stream, model, or system. For Ollama thinking
                (e.g. qwen3.5:4b) use <code>{'{"think": true}'}</code>.
              </span>
            </label>
            {agentSettings && (
              <p className="muted small">
                Status:{' '}
                {agentSettings.configured
                  ? 'ready'
                  : agentEnabled
                    ? 'incomplete configuration'
                    : 'disabled'}
                {agentSettings.has_api_key ? ' · API key saved' : ''}
              </p>
            )}
            <button type="submit" disabled={agentBusy}>
              Save agent settings
            </button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section className="panel">
          <h2>Users</h2>
          <p className="muted small">
            Assign Admin, Read + write, or Read only roles. Admins can manage
            users, settings, and plugins.
          </p>
          <ul className="plain-list">
            {users.map(u => (
              <li key={u.id} className="user-row">
                {editUserId === u.id ? (
                  <form className="form-col" onSubmit={saveUser}>
                    <label>
                      Username
                      <input
                        value={editUsername}
                        onChange={e => setEditUsername(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      New password (optional)
                      <input
                        type="password"
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={editUserRoleId}
                        onChange={e =>
                          setEditUserRoleId(Number(e.target.value))
                        }
                      >
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="row-actions">
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setEditUserId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span>
                      <strong>{u.username}</strong>{' '}
                      <span className="muted small">({u.role_slug})</span>
                    </span>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditUserId(u.id)
                          setEditUsername(u.username)
                          setEditUserRoleId(u.role_id)
                          setEditPassword('')
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeUser(u.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form className="form-col" onSubmit={createUser}>
            <h3>Add user</h3>
            <label>
              Username
              <input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Role
              <select
                value={newUserRoleId}
                onChange={e => setNewUserRoleId(Number(e.target.value))}
                required
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Create user</button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section className="panel">
          <h2>Roles</h2>
          <p className="muted small">
            Built-in Admin and Read only roles cannot be changed. Custom roles
            can write (optional) and are limited to selected plugins.
          </p>
          <ul className="plain-list">
            {roles.map(r => (
              <li key={r.id} className="user-row">
                <div>
                  <strong>{r.name}</strong>{' '}
                  <span className="muted small">({r.slug})</span>
                  <div className="muted small">
                    {r.is_system
                      ? 'System role · all plugins'
                      : `${r.can_write ? 'Write' : 'Read-only'} · ${
                          r.plugins === 'all'
                            ? 'all plugins'
                            : `${r.plugins.length} plugin(s)`
                        }`}
                  </div>
                </div>
                {!r.is_system && (
                  <div className="row-actions">
                    <button type="button" onClick={() => startEditRole(r)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void removeRole(r.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <form
            className="form-col"
            onSubmit={editRoleId != null ? saveRole : createRole}
          >
            <h3>{editRoleId != null ? 'Edit role' : 'Add role'}</h3>
            <label>
              Name
              <input
                value={roleName}
                onChange={e => setRoleName(e.target.value)}
                required
              />
            </label>
            <label className="check-ids-item">
              <input
                type="checkbox"
                checked={roleCanWrite}
                onChange={e => setRoleCanWrite(e.target.checked)}
              />
              Allow writes
            </label>
            <fieldset className="plugin-allowlist">
              <legend>Plugin access</legend>
              {availablePlugins.length === 0 ? (
                <p className="muted small">No plugins loaded</p>
              ) : (
                availablePlugins.map(p => (
                  <label key={pluginKey(p)} className="check-ids-item">
                    <input
                      type="checkbox"
                      checked={rolePlugins.some(
                        x => pluginKey(x) === pluginKey(p),
                      )}
                      onChange={() => toggleRolePlugin(p)}
                    />
                    {p.kind}/{p.id}
                  </label>
                ))
              )}
            </fieldset>
            <div className="row-actions">
              <button type="submit">
                {editRoleId != null ? 'Save role' : 'Create role'}
              </button>
              {editRoleId != null && (
                <button type="button" onClick={cancelEditRole}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <h2>Plugin manager</h2>
        {!plugins ? (
          <p className="muted">Loading plugins…</p>
        ) : (
          <div className="stack">
            {plugins.auth && (
              <div>
                <h3>Auth</h3>
                <p className="muted small">
                  Changing the auth plugin requires an API restart.
                </p>
                <div className="plugin-manager-list">
                  <PluginManagerRow
                    id={plugins.auth.id}
                    enabled={plugins.auth.enabled}
                    description={plugins.auth.description}
                    busy={pluginBusy === `auth:${plugins.auth.id}`}
                    onToggle={enabled => {
                      if (!isAdmin) return
                      void togglePlugin('auth', plugins.auth!.id, enabled)
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <h3>Scheduler</h3>
              <div className="plugin-manager-list">
                <PluginManagerRow
                  id={plugins.scheduler.id}
                  enabled={plugins.scheduler.enabled}
                  description={plugins.scheduler.description}
                  busy={pluginBusy === `scheduler:${plugins.scheduler.id}`}
                  onToggle={enabled => {
                    if (!isAdmin) return
                    void togglePlugin(
                      'scheduler',
                      plugins.scheduler.id,
                      enabled,
                    )
                  }}
                />
              </div>
            </div>

            <div>
              <h3>Checks</h3>
              <div className="plugin-manager-list">
                {plugins.checks.map(c => (
                  <PluginManagerRow
                    key={c.id}
                    id={c.id}
                    enabled={c.enabled}
                    description={c.description}
                    busy={pluginBusy === `check:${c.id}`}
                    onToggle={enabled => {
                      if (!isAdmin) return
                      void togglePlugin('check', c.id, enabled)
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3>Notifiers</h3>
              <div className="plugin-manager-list">
                {plugins.notifiers.map(n => (
                  <PluginManagerRow
                    key={n.id}
                    id={n.id}
                    enabled={n.enabled}
                    description={n.description}
                    busy={pluginBusy === `notify:${n.id}`}
                    extra={!n.ready ? ' (not ready)' : undefined}
                    onToggle={enabled => {
                      if (!isAdmin) return
                      void togglePlugin('notify', n.id, enabled)
                    }}
                  />
                ))}
              </div>
            </div>
            {!isAdmin && (
              <p className="muted small">
                Plugin enable/disable requires admin access.
              </p>
            )}
          </div>
        )}
      </section>

      {message && <p className="ok-text">{message}</p>}
      {error && <p className="error">{error}</p>}
      {!canWrite && (
        <p className="muted small">
          You are in read-only mode; mutating settings requires write access.
        </p>
      )}
    </div>
  )
}
