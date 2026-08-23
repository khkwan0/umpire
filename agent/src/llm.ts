import type {AgentToolCall, ChatMessage, LlmConfig, LlmToolDef} from './types.js'

type OpenAiMessage =
  | {role: 'system' | 'user' | 'assistant'; content: string}
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {name: string; arguments: string}
      }>
    }
  | {role: 'tool'; tool_call_id: string; content: string}

export interface LlmTurnResult {
  message: string | null
  toolCalls: AgentToolCall[]
}

function toOpenAiTools(tools: LlmToolDef[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function toOpenAiMessages(messages: ChatMessage[]): OpenAiMessage[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {role: 'tool', tool_call_id: m.tool_call_id!, content: m.content}
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      }
    }
    return {role: m.role, content: m.content}
  })
}

export async function runOpenAiTurn(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: LlmToolDef[],
): Promise<LlmTurnResult> {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1'
  const headers: Record<string, string> = {'content-type': 'application/json'}
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: toOpenAiMessages(messages),
      tools: toOpenAiTools(tools),
      tool_choice: 'auto',
    }),
  })

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    throw new Error(`LLM request failed: ${text.slice(0, 300)}`)
  }

  if (!res.ok) {
    const err =
      body &&
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as {error: {message?: string}}).error?.message === 'string'
        ? (body as {error: {message: string}}).error.message
        : text.slice(0, 300)
    throw new Error(err)
  }

  const choice = (
    body as {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{
            id: string
            function: {name: string; arguments: string}
          }>
        }
      }>
    }
  ).choices?.[0]?.message

  if (!choice) throw new Error('Empty LLM response')

  const toolCalls: AgentToolCall[] = []
  for (const tc of choice.tool_calls ?? []) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.function.arguments || '{}') as Record<
        string,
        unknown
      >
    } catch {
      args = {}
    }
    toolCalls.push({
      id: tc.id,
      name: tc.function.name,
      arguments: args,
    })
  }

  return {
    message: choice.content?.trim() || null,
    toolCalls,
  }
}

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | Array<{type: string; [key: string]: unknown}>
}

function toAnthropicMessages(
  messages: ChatMessage[],
): {system: string; messages: AnthropicMessage[]} {
  const systemParts: string[] = []
  const out: AnthropicMessage[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
      continue
    }
    if (m.role === 'user') {
      out.push({role: 'user', content: m.content})
      continue
    }
    if (m.role === 'assistant') {
      out.push({role: 'assistant', content: m.content})
      continue
    }
    if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: m.content,
          },
        ],
      })
    }
  }

  return {system: systemParts.join('\n\n'), messages: out}
}

export async function runAnthropicTurn(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: LlmToolDef[],
): Promise<LlmTurnResult> {
  const {system, messages: anthropicMessages} = toAnthropicMessages(messages)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: system || undefined,
      messages: anthropicMessages,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  })

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    throw new Error(`LLM request failed: ${text.slice(0, 300)}`)
  }

  if (!res.ok) {
    const err =
      body &&
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as {error: {message?: string}}).error?.message === 'string'
        ? (body as {error: {message: string}}).error.message
        : text.slice(0, 300)
    throw new Error(err)
  }

  const content = (
    body as {
      content?: Array<{type: string; text?: string; id?: string; name?: string; input?: unknown}>
    }
  ).content ?? []

  let message: string | null = null
  const toolCalls: AgentToolCall[] = []

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      message = (message ? `${message}\n` : '') + block.text
    }
    if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: (block.input as Record<string, unknown>) ?? {},
      })
    }
  }

  return {message: message?.trim() || null, toolCalls}
}

export async function runLlmTurn(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: LlmToolDef[],
): Promise<LlmTurnResult> {
  if (config.provider === 'anthropic') {
    return runAnthropicTurn(config, messages, tools)
  }
  return runOpenAiTurn(config, messages, tools)
}
