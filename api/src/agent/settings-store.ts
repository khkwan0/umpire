import {
  emptyAgentRequestExtras,
  mergeAgentRequestExtras,
  parseAgentRequestExtras,
  parseLlmProvider,
  type AgentRequestExtras,
  type LlmProvider,
  type StoredAgentSettings,
} from 'umpire-agent'

export type AgentSettingsUpdate = {
  enabled?: boolean
  provider?: LlmProvider
  model?: string
  base_url?: string | null
  /** Omit to keep existing; empty string clears. */
  api_key?: string
  max_tool_rounds?: number
  request_extras?: Partial<AgentRequestExtras> | AgentRequestExtras
}

const AGENT_KEYS = [
  'agent_enabled',
  'agent_provider',
  'agent_model',
  'agent_base_url',
  'agent_api_key',
  'agent_max_tool_rounds',
  'agent_request_extras',
] as const

export function hasStoredAgentSettings(map: Record<string, string>): boolean {
  return map.agent_provider !== undefined
}

export function parseStoredAgentSettings(
  map: Record<string, string>,
): StoredAgentSettings | null {
  if (!hasStoredAgentSettings(map)) return null
  return {
    enabled: map.agent_enabled === '1',
    provider: parseLlmProvider(map.agent_provider),
    model: map.agent_model?.trim() ?? '',
    base_url: map.agent_base_url?.trim() || null,
    api_key: map.agent_api_key ?? '',
    max_tool_rounds: Math.min(
      20,
      Math.max(1, Number(map.agent_max_tool_rounds) || 12),
    ),
    request_extras: parseAgentRequestExtras(map.agent_request_extras),
  }
}

export function defaultStoredAgentSettings(): StoredAgentSettings {
  return {
    enabled: false,
    provider: 'openai',
    model: 'gpt-4o-mini',
    base_url: null,
    api_key: '',
    max_tool_rounds: 12,
    request_extras: emptyAgentRequestExtras(),
  }
}

export function mergeAgentSettingsUpdate(
  current: StoredAgentSettings,
  partial: AgentSettingsUpdate,
): StoredAgentSettings {
  const next: StoredAgentSettings = {
    enabled: partial.enabled ?? current.enabled,
    provider: partial.provider ?? current.provider,
    model: partial.model !== undefined ? partial.model.trim() : current.model,
    base_url:
      partial.base_url !== undefined
        ? partial.base_url?.trim() || null
        : current.base_url,
    api_key:
      partial.api_key !== undefined ? partial.api_key.trim() : current.api_key,
    max_tool_rounds: partial.max_tool_rounds ?? current.max_tool_rounds,
    request_extras:
      partial.request_extras !== undefined
        ? mergeAgentRequestExtras(
            current.request_extras,
            partial.request_extras,
          )
        : current.request_extras,
  }

  if (!Number.isFinite(next.max_tool_rounds) || next.max_tool_rounds < 1) {
    throw new Error('max_tool_rounds must be >= 1')
  }
  if (next.max_tool_rounds > 20) {
    throw new Error('max_tool_rounds must be <= 20')
  }

  if (next.enabled) {
    const model = next.model || ''
    if (!model) {
      throw new Error('model is required when the agent is enabled')
    }
    if (
      (next.provider === 'openai' || next.provider === 'anthropic') &&
      !next.api_key
    ) {
      throw new Error('API key is required for this provider')
    }
    if (next.provider !== 'anthropic' && !next.base_url) {
      // base_url can be omitted if provider has default; stored null is ok
    }
  }

  return next
}

export function writeStoredAgentSettings(
  upsert: {run: (key: string, value: string) => unknown},
  stored: StoredAgentSettings,
): void {
  upsert.run('agent_enabled', stored.enabled ? '1' : '0')
  upsert.run('agent_provider', stored.provider)
  upsert.run('agent_model', stored.model)
  upsert.run('agent_base_url', stored.base_url ?? '')
  upsert.run('agent_api_key', stored.api_key)
  upsert.run('agent_max_tool_rounds', String(stored.max_tool_rounds))
  upsert.run('agent_request_extras', JSON.stringify(stored.request_extras))
}

export {AGENT_KEYS}
