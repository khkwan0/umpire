import {
  defaultStoredAgentSettings,
  mergeAgentSettingsUpdate,
  parseStoredAgentSettings,
} from '../agent/settings-store.js'

describe('agent settings store', () => {
  it('parses stored agent settings from the settings map', () => {
    expect(
      parseStoredAgentSettings({
        agent_provider: 'ollama',
        agent_enabled: '1',
        agent_model: 'mistral',
        agent_base_url: 'http://127.0.0.1:11434/v1',
        agent_api_key: '',
        agent_max_tool_rounds: '8',
      }),
    ).toEqual({
      enabled: true,
      provider: 'ollama',
      model: 'mistral',
      base_url: 'http://127.0.0.1:11434/v1',
      api_key: '',
      max_tool_rounds: 8,
    })
  })

  it('requires an API key for OpenAI when enabled', () => {
    const current = defaultStoredAgentSettings()
    expect(() =>
      mergeAgentSettingsUpdate(current, {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        api_key: '',
      }),
    ).toThrow('API key is required')
  })

  it('allows Ollama without an API key', () => {
    const current = defaultStoredAgentSettings()
    expect(
      mergeAgentSettingsUpdate(current, {
        enabled: true,
        provider: 'ollama',
        model: 'llama3.2',
        base_url: 'http://127.0.0.1:11434/v1',
        api_key: '',
      }),
    ).toEqual({
      enabled: true,
      provider: 'ollama',
      model: 'llama3.2',
      base_url: 'http://127.0.0.1:11434/v1',
      api_key: '',
      max_tool_rounds: 12,
    })
  })
})
