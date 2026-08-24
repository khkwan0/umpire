import {parseSseDataLine, readSseLines} from './stream.js'
import type {
  AgentToolCall,
  ChatMessage,
  LlmConfig,
  LlmToolDef,
} from './types.js'

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
  reasoning?: string | null
  toolCalls: AgentToolCall[]
}

export type LlmTurnOptions = {
  onDelta?: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
}

const REQUEST_EXTRAS_RESERVED = new Set([
  'messages',
  'tools',
  'tool_choice',
  'stream',
  'system',
  'model',
])

function applyRequestExtras(
  base: Record<string, unknown>,
  extras: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!extras) return base
  const extra: Record<string, unknown> = {}
  const assign = (src: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(src)) {
      if (
        key === 'extra_body' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        assign(value as Record<string, unknown>)
        continue
      }
      if (REQUEST_EXTRAS_RESERVED.has(key)) continue
      extra[key] = value
    }
  }
  assign(extras)
  return {...base, ...extra}
}

function reasoningTextFrom(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return ''
  const rec = obj as Record<string, unknown>
  for (const key of ['reasoning_content', 'reasoning', 'thinking']) {
    const value = rec[key]
    if (typeof value === 'string' && value) return value
  }
  return ''
}

function parseToolCallArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
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
    body: JSON.stringify(
      applyRequestExtras(
        {
          model: config.model,
          messages: toOpenAiMessages(messages),
          tools: toOpenAiTools(tools),
          tool_choice: 'auto',
        },
        config.requestExtras,
      ),
    ),
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
    reasoning: reasoningTextFrom(choice).trim() || null,
    toolCalls,
  }
}

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | Array<{type: string; [key: string]: unknown}>
}

function toAnthropicMessages(messages: ChatMessage[]): {
  system: string
  messages: AnthropicMessage[]
} {
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
    body: JSON.stringify(
      applyRequestExtras(
        {
          model: config.model,
          max_tokens: 4096,
          system: system || undefined,
          messages: anthropicMessages,
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
        },
        config.requestExtras,
      ),
    ),
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

  const content =
    (
      body as {
        content?: Array<{
          type: string
          text?: string
          thinking?: string
          id?: string
          name?: string
          input?: unknown
        }>
      }
    ).content ?? []

  let message: string | null = null
  let reasoning = ''
  const toolCalls: AgentToolCall[] = []

  for (const block of content) {
    if (block.type === 'thinking' && block.thinking) {
      reasoning += block.thinking
    }
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

  return {
    message: message?.trim() || null,
    reasoning: reasoning.trim() || null,
    toolCalls,
  }
}

async function parseOpenAiStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
  onReasoningDelta?: (delta: string) => void,
): Promise<LlmTurnResult> {
  let message = ''
  let reasoning = ''
  const toolCalls = new Map<
    number,
    {id: string; name: string; args: string}
  >()

  for await (const line of readSseLines(body)) {
    const dataStr = parseSseDataLine(line)
    if (!dataStr) continue

    let json: {
      choices?: Array<{
        delta?: {
          content?: string
          reasoning_content?: string
          reasoning?: string
          thinking?: string
          tool_calls?: Array<{
            index?: number
            id?: string
            function?: {name?: string; arguments?: string}
          }>
        }
        message?: {
          reasoning_content?: string
          reasoning?: string
          thinking?: string
        }
      }>
    }
    try {
      json = JSON.parse(dataStr) as typeof json
    } catch {
      continue
    }

    const choice = json.choices?.[0]
    const delta = choice?.delta
    if (delta) {
      if (delta.content) {
        message += delta.content
        onDelta(delta.content)
      }
      const reasoningChunk = reasoningTextFrom(delta)
      if (reasoningChunk) {
        reasoning += reasoningChunk
        onReasoningDelta?.(reasoningChunk)
      }

      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0
        let entry = toolCalls.get(idx)
        if (!entry) {
          entry = {id: tc.id ?? '', name: tc.function?.name ?? '', args: ''}
          toolCalls.set(idx, entry)
        }
        if (tc.id) entry.id = tc.id
        if (tc.function?.name) entry.name = tc.function.name
        if (tc.function?.arguments) entry.args += tc.function.arguments
      }
      continue
    }

    const fromMessage = reasoningTextFrom(choice?.message)
    if (fromMessage && fromMessage.length > reasoning.length) {
      const extra = fromMessage.slice(reasoning.length)
      reasoning = fromMessage
      if (extra) onReasoningDelta?.(extra)
    }
  }

  const calls: AgentToolCall[] = [...toolCalls.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, tc]) => tc.name)
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
      name: tc.name,
      arguments: parseToolCallArgs(tc.args),
    }))

  return {
    message: message.trim() || null,
    reasoning: reasoning.trim() || null,
    toolCalls: calls,
  }
}

export async function runOpenAiTurnStream(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: LlmToolDef[],
  onDelta: (delta: string) => void,
  onReasoningDelta?: (delta: string) => void,
): Promise<LlmTurnResult> {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1'
  const headers: Record<string, string> = {'content-type': 'application/json'}
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(
      applyRequestExtras(
        {
          model: config.model,
          messages: toOpenAiMessages(messages),
          tools: toOpenAiTools(tools),
          tool_choice: 'auto',
          stream: true,
        },
        config.requestExtras,
      ),
    ),
  })

  if (!res.ok || !res.body) {
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw new Error(`LLM request failed: ${text.slice(0, 300)}`)
    }
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

  return parseOpenAiStream(res.body, onDelta, onReasoningDelta)
}

async function parseAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
  onReasoningDelta?: (delta: string) => void,
): Promise<LlmTurnResult> {
  let message = ''
  let reasoning = ''
  const toolBlocks = new Map<
    number,
    {id: string; name: string; args: string}
  >()
  let currentEvent = ''

  for await (const line of readSseLines(body)) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim()
      continue
    }

    const dataStr = parseSseDataLine(line)
    if (!dataStr) continue

    let data: {
      type?: string
      index?: number
      content_block?: {
        type?: string
        id?: string
        name?: string
        thinking?: string
      }
      delta?: {
        type?: string
        text?: string
        partial_json?: string
        thinking?: string
      }
    }
    try {
      data = JSON.parse(dataStr) as typeof data
    } catch {
      continue
    }

    const eventType = data.type ?? currentEvent

    if (eventType === 'content_block_start' && data.content_block) {
      if (data.content_block.type === 'tool_use') {
        toolBlocks.set(data.index ?? 0, {
          id: data.content_block.id ?? '',
          name: data.content_block.name ?? '',
          args: '',
        })
      }
      if (
        data.content_block.type === 'thinking' &&
        data.content_block.thinking
      ) {
        reasoning += data.content_block.thinking
        onReasoningDelta?.(data.content_block.thinking)
      }
      continue
    }

    if (eventType === 'content_block_delta' && data.delta) {
      if (data.delta.type === 'text_delta' && data.delta.text) {
        message += data.delta.text
        onDelta(data.delta.text)
      }
      if (data.delta.type === 'thinking_delta' && data.delta.thinking) {
        reasoning += data.delta.thinking
        onReasoningDelta?.(data.delta.thinking)
      }
      if (data.delta.type === 'input_json_delta' && data.delta.partial_json) {
        const block = toolBlocks.get(data.index ?? 0)
        if (block) block.args += data.delta.partial_json
      }
    }
  }

  const toolCalls: AgentToolCall[] = [...toolBlocks.values()]
    .filter(block => block.name)
    .map(block => ({
      id: block.id || `call_${Math.random().toString(36).slice(2)}`,
      name: block.name,
      arguments: parseToolCallArgs(block.args),
    }))

  return {
    message: message.trim() || null,
    reasoning: reasoning.trim() || null,
    toolCalls,
  }
}

export async function runAnthropicTurnStream(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: LlmToolDef[],
  onDelta: (delta: string) => void,
  onReasoningDelta?: (delta: string) => void,
): Promise<LlmTurnResult> {
  const {system, messages: anthropicMessages} = toAnthropicMessages(messages)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(
      applyRequestExtras(
        {
          model: config.model,
          max_tokens: 4096,
          system: system || undefined,
          messages: anthropicMessages,
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
          stream: true,
        },
        config.requestExtras,
      ),
    ),
  })

  if (!res.ok || !res.body) {
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw new Error(`LLM request failed: ${text.slice(0, 300)}`)
    }
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

  return parseAnthropicStream(res.body, onDelta, onReasoningDelta)
}

export async function runLlmTurn(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: LlmToolDef[],
  opts?: LlmTurnOptions,
): Promise<LlmTurnResult> {
  if (opts?.onDelta) {
    if (config.provider === 'anthropic') {
      return runAnthropicTurnStream(
        config,
        messages,
        tools,
        opts.onDelta,
        opts.onReasoningDelta,
      )
    }
    return runOpenAiTurnStream(
      config,
      messages,
      tools,
      opts.onDelta,
      opts.onReasoningDelta,
    )
  }
  if (config.provider === 'anthropic') {
    return runAnthropicTurn(config, messages, tools)
  }
  return runOpenAiTurn(config, messages, tools)
}
