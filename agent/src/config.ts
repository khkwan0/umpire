import type {LlmConfig} from './types.js'

export type LlmProvider = 'openai' | 'anthropic' | 'ollama' | 'vllm'

export interface StoredAgentSettings {
  enabled: boolean
  provider: LlmProvider
  model: string
  base_url: string | null
  api_key: string
  max_tool_rounds: number
}

export interface AgentSettingsView {
  enabled: boolean
  provider: LlmProvider
  model: string
  base_url: string | null
  has_api_key: boolean
  max_tool_rounds: number
  configured: boolean
  config_source: 'database' | 'environment' | 'none'
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
