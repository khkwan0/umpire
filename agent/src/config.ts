import type {LlmConfig} from './types.js'

export type LlmProvider = 'openai' | 'anthropic' | 'ollama' | 'vllm'

export const LLM_PROVIDERS: LlmProvider[] = [
  'openai',
  'anthropic',
  'ollama',
  'vllm',
]

export type AgentRequestExtras = Record<LlmProvider, Record<string, unknown>>

export interface StoredAgentSettings {
  enabled: boolean
  provider: LlmProvider
  model: string
  base_url: string | null
  api_key: string
  max_tool_rounds: number
  request_extras: AgentRequestExtras
}

export interface AgentSettingsView {
  enabled: boolean
  provider: LlmProvider
  model: string
  base_url: string | null
  has_api_key: boolean
  max_tool_rounds: number
  request_extras: AgentRequestExtras
  configured: boolean
  config_source: 'database' | 'environment' | 'none'
}

const EXTRAS_MAX_CHARS = 16_384

const ENV_EXTRAS_KEYS: Record<LlmProvider, string> = {
  openai: 'OPENAI_REQUEST_EXTRAS',
  anthropic: 'ANTHROPIC_REQUEST_EXTRAS',
  ollama: 'OLLAMA_REQUEST_EXTRAS',
  vllm: 'VLLM_REQUEST_EXTRAS',
}

export function emptyAgentRequestExtras(): AgentRequestExtras {
  return {
    openai: {},
    anthropic: {},
    ollama: {},
    vllm: {},
  }
}

function parseJsonObject(raw: string | undefined | null): Record<string, unknown> {
  const trimmed = raw?.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }
  return {}
}

/** Lenient parse of the stored extras map (invalid JSON becomes empty). */
export function parseAgentRequestExtras(
  raw: string | undefined | null,
): AgentRequestExtras {
  const out = emptyAgentRequestExtras()
  if (!raw?.trim()) return out
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return out
    }
    const obj = parsed as Record<string, unknown>
    for (const key of LLM_PROVIDERS) {
      const value = obj[key]
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = value as Record<string, unknown>
      }
    }
  } catch {
    return out
  }
  return out
}

/** Merge a partial extras map; provided provider keys replace that provider's object. */
export function mergeAgentRequestExtras(
  current: AgentRequestExtras,
  partial: unknown,
): AgentRequestExtras {
  if (partial === undefined) return current
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new Error('request_extras must be a JSON object')
  }
  const obj = partial as Record<string, unknown>
  const next: AgentRequestExtras = {
    openai: {...current.openai},
    anthropic: {...current.anthropic},
    ollama: {...current.ollama},
    vllm: {...current.vllm},
  }
  for (const key of LLM_PROVIDERS) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
    const value = obj[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`request_extras.${key} must be a JSON object`)
    }
    next[key] = value as Record<string, unknown>
  }
  if (JSON.stringify(next).length > EXTRAS_MAX_CHARS) {
    throw new Error('request_extras is too large')
  }
  return next
}

export function extrasFromEnv(
  env: NodeJS.ProcessEnv,
  provider: LlmProvider,
): Record<string, unknown> {
  const specific = parseJsonObject(env[ENV_EXTRAS_KEYS[provider]])
  if (Object.keys(specific).length > 0) return specific
  return parseJsonObject(env.AGENT_REQUEST_EXTRAS)
}

export function extrasMapFromEnv(
  env: NodeJS.ProcessEnv,
  activeProvider: LlmProvider,
): AgentRequestExtras {
  const map = emptyAgentRequestExtras()
  for (const provider of LLM_PROVIDERS) {
    map[provider] = parseJsonObject(env[ENV_EXTRAS_KEYS[provider]])
  }
  if (Object.keys(map[activeProvider]).length === 0) {
    map[activeProvider] = parseJsonObject(env.AGENT_REQUEST_EXTRAS)
  }
  return map
}

export const LLM_PROVIDER_META: Record<
  LlmProvider,
  {
    label: string
    defaultBaseUrl: string | null
    defaultModel: string
    apiKeyRequired: boolean
    baseUrlHint: string
  }
> = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyRequired: true,
    baseUrlHint: 'OpenAI or any OpenAI-compatible API base URL',
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: null,
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyRequired: true,
    baseUrlHint: 'Anthropic uses a fixed API endpoint',
  },
  ollama: {
    label: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3.2',
    apiKeyRequired: false,
    baseUrlHint:
      'Ollama OpenAI-compatible endpoint (use host.docker.internal from Docker)',
  },
  vllm: {
    label: 'vLLM',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    defaultModel: '',
    apiKeyRequired: false,
    baseUrlHint: 'vLLM OpenAI-compatible server base URL',
  },
}

const PROVIDERS = new Set<string>(Object.keys(LLM_PROVIDER_META))

export function parseLlmProvider(raw: string | undefined | null): LlmProvider {
  const value = (raw ?? 'openai').toLowerCase()
  if (value === 'openai_compatible') return 'vllm'
  return PROVIDERS.has(value) ? (value as LlmProvider) : 'openai'
}

function clampToolRounds(value: unknown): number {
  return Math.min(20, Math.max(1, Number(value) || 12))
}

function normalizeBaseUrl(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\/+$/, '')
}

function llmConfigFromStored(stored: StoredAgentSettings): LlmConfig | null {
  if (!stored.enabled) return null

  const meta = LLM_PROVIDER_META[stored.provider]
  const model = stored.model.trim() || meta.defaultModel
  if (!model) return null

  const apiKey = stored.api_key.trim()
  if (meta.apiKeyRequired && !apiKey) return null

  const baseUrl =
    stored.provider === 'anthropic'
      ? undefined
      : (normalizeBaseUrl(stored.base_url) ?? meta.defaultBaseUrl ?? undefined)

  if (stored.provider !== 'anthropic' && !baseUrl) return null

  return {
    provider: stored.provider === 'anthropic' ? 'anthropic' : 'openai',
    apiKey,
    model,
    baseUrl,
    maxToolRounds: clampToolRounds(stored.max_tool_rounds),
    requestExtras: stored.request_extras[stored.provider] ?? {},
  }
}

export function loadLlmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmConfig | null {
  const provider = parseLlmProvider(env.AGENT_LLM_PROVIDER)
  const maxToolRounds = clampToolRounds(env.AGENT_MAX_TOOL_ROUNDS)

  if (provider === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return null
    return {
      provider: 'anthropic',
      apiKey,
      model: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514',
      maxToolRounds,
      requestExtras: extrasFromEnv(env, provider),
    }
  }

  if (provider === 'ollama') {
    const model =
      env.OLLAMA_MODEL?.trim() || env.OPENAI_MODEL?.trim() || 'llama3.2'
    const baseUrl =
      normalizeBaseUrl(env.OLLAMA_BASE_URL) ??
      normalizeBaseUrl(env.OPENAI_BASE_URL) ??
      'http://127.0.0.1:11434/v1'
    return {
      provider: 'openai',
      apiKey: env.OLLAMA_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '',
      model,
      baseUrl,
      maxToolRounds,
      requestExtras: extrasFromEnv(env, provider),
    }
  }

  if (provider === 'vllm') {
    const model = env.VLLM_MODEL?.trim() || env.OPENAI_MODEL?.trim() || ''
    if (!model) return null
    const baseUrl =
      normalizeBaseUrl(env.VLLM_BASE_URL) ??
      normalizeBaseUrl(env.OPENAI_BASE_URL) ??
      'http://127.0.0.1:8000/v1'
    return {
      provider: 'openai',
      apiKey: env.VLLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '',
      model,
      baseUrl,
      maxToolRounds,
      requestExtras: extrasFromEnv(env, provider),
    }
  }

  const apiKey = env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return {
    provider: 'openai',
    apiKey,
    model: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    baseUrl:
      normalizeBaseUrl(env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1',
    maxToolRounds,
    requestExtras: extrasFromEnv(env, provider),
  }
}

export function resolveLlmConfig(input?: {
  stored?: StoredAgentSettings | null
  env?: NodeJS.ProcessEnv
}): LlmConfig | null {
  if (input?.stored) {
    return llmConfigFromStored(input.stored)
  }
  return loadLlmConfigFromEnv(input?.env)
}

export function toAgentSettingsView(input: {
  stored?: StoredAgentSettings | null
  llm: LlmConfig | null
  configSource: AgentSettingsView['config_source']
}): AgentSettingsView {
  const stored = input.stored
  const provider =
    stored?.provider ?? parseLlmProvider(process.env.AGENT_LLM_PROVIDER)
  const meta = LLM_PROVIDER_META[provider]

  return {
    enabled: stored?.enabled ?? Boolean(input.llm),
    provider,
    model: stored?.model.trim() || input.llm?.model || meta.defaultModel,
    base_url: stored?.base_url ?? input.llm?.baseUrl ?? meta.defaultBaseUrl,
    has_api_key: Boolean(stored?.api_key.trim() || input.llm?.apiKey),
    max_tool_rounds: stored?.max_tool_rounds ?? input.llm?.maxToolRounds ?? 12,
    request_extras:
      stored?.request_extras ?? extrasMapFromEnv(process.env, provider),
    configured: input.llm !== null,
    config_source: input.configSource,
  }
}

export function agentConfigured(
  config: LlmConfig | null = loadLlmConfigFromEnv(),
): boolean {
  return config !== null
}

/** @deprecated Use loadLlmConfigFromEnv or resolveLlmConfig */
export function loadLlmConfig(): LlmConfig | null {
  return loadLlmConfigFromEnv()
}
