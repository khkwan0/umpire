import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react'
import {
  api,
  isTransientApiError,
  type AlertPolicy,
  type AgentLlmProvider,
  type AgentSettings,
  type PluginManagerState,
  type Settings,
} from '../api'
import {authUiForPlugin} from '../auth-plugin-ui'
import {useAuth} from '../auth'
import ReconnectBanner from '../ReconnectBanner'
import ThemeSwitcher from '../ThemeSwitcher'
import TimezoneSelect from '../TimezoneSelect'
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

export default function SettingsPage() {
  const {restart} = useOnboarding()
  const {policy, principal, refresh: refreshAuth} = useAuth()
  const isAdmin = Boolean(principal?.is_admin)
  const canWrite = Boolean(principal?.can_write)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [policyAlert, setPolicyAlert] = useState<AlertPolicy>('state_change')
  const [throttle, setThrottle] = useState(30)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [plugins, setPlugins] = useState<PluginManagerState | null>(null)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)

  const activeAuthUi = useMemo(
    () => authUiForPlugin(plugins?.auth?.id),
    [plugins?.auth?.id],
  )

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
        if (isAdmin) {
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
  }, [loadAgentSettings, isAdmin])

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

  function onAgentProviderChange(provider: AgentLlmProvider) {
    const meta = agentProviderMeta(provider)
    setAgentProvider(provider)
    setAgentModel(meta.defaultModel)
    setAgentBaseUrl(meta.defaultBaseUrl ?? '')
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

      {activeAuthUi && plugins?.auth && !policy?.auth_enabled && (
        <activeAuthUi.DisabledNotice />
      )}

      {activeAuthUi && policy?.auth_enabled && (
        <activeAuthUi.Settings pluginManager={plugins} />
      )}

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
                  Enabling or disabling auth takes effect immediately. Swapping
                  which auth plugin is loaded requires an API restart.
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
