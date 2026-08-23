export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  tool_call_id?: string
  name?: string
  tool_calls?: AgentToolCall[]
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface LlmToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type AgentEvent =
  | {type: 'tool_start'; tool: string; args: Record<string, unknown>}
  | {type: 'tool_end'; tool: string; summary: string}
  | {type: 'assistant_delta'; delta: string}
  | {type: 'assistant'; message: string}
  | {type: 'error'; error: string}

export type UmpireCaller = (
  method: string,
  path: string,
  opts?: {query?: Record<string, string | number | boolean>; body?: unknown},
) => Promise<unknown>

export interface LlmConfig {
  /** OpenAI-compatible providers use provider "openai" at the HTTP layer. */
  provider: 'openai' | 'anthropic'
  apiKey: string
  model: string
  baseUrl?: string
  maxToolRounds: number
}

export interface AgentConfig {
  llm: LlmConfig
  systemPrompt?: string
}

export type {
  LlmProvider,
  StoredAgentSettings,
  AgentSettingsView,
} from './config.js'
export {
  LLM_PROVIDER_META,
  agentConfigured,
  loadLlmConfig,
  loadLlmConfigFromEnv,
  parseLlmProvider,
  resolveLlmConfig,
  toAgentSettingsView,
} from './config.js'
