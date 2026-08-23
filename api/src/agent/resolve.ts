import {getCore} from '../core/index.js'
import {
  resolveLlmConfig,
  toAgentSettingsView,
  type LlmConfig,
  type StoredAgentSettings,
} from 'umpire-agent'
import type {AgentConfigSource, AgentSettings} from '../plugins/types.js'

export function getAgentLlmConfig(): {
  stored: StoredAgentSettings | null
  llm: LlmConfig | null
  configSource: AgentConfigSource
} {
  const stored = getCore().getStoredAgentSettings()
  const llm = resolveLlmConfig({stored})
  const configSource: AgentConfigSource = stored
    ? 'database'
    : llm
      ? 'environment'
      : 'none'
  return {stored, llm, configSource}
}

export function getAgentSettingsPublic(): AgentSettings {
  const {stored, llm, configSource} = getAgentLlmConfig()
  return toAgentSettingsView({stored, llm, configSource})
}
