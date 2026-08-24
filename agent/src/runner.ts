import {runLlmTurn} from './llm.js'
import {AGENT_TOOLS, DEFAULT_SYSTEM_PROMPT, executeAgentTool} from './tools.js'
import type {
  AgentConfig,
  AgentEvent,
  ChatMessage,
  LlmConfig,
  UmpireCaller,
} from './types.js'

export type AgentEventHandler = (event: AgentEvent) => void

export async function runAgentChat(input: {
  llm: LlmConfig
  umpire: UmpireCaller
  userMessage: string
  history?: ChatMessage[]
  systemPrompt?: string
  onEvent?: AgentEventHandler
}): Promise<string> {
  const {
    llm,
    umpire,
    userMessage,
    history = [],
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    onEvent,
  } = input

  const messages: ChatMessage[] = [
    {role: 'system', content: systemPrompt},
    ...history.filter(m => m.role === 'user' || m.role === 'assistant'),
    {role: 'user', content: userMessage},
  ]

  for (let round = 0; round < llm.maxToolRounds; round += 1) {
    let streamed = false
    let streamedReasoning = false
    const turn = await runLlmTurn(llm, messages, AGENT_TOOLS, {
      onDelta: onEvent
        ? delta => {
            streamed = true
            onEvent({type: 'assistant_delta', delta})
          }
        : undefined,
      onReasoningDelta: onEvent
        ? delta => {
            streamedReasoning = true
            onEvent({type: 'reasoning_delta', delta})
          }
        : undefined,
    })

    if (turn.reasoning && !streamedReasoning) {
      onEvent?.({type: 'reasoning_delta', delta: turn.reasoning})
    }

    if (turn.toolCalls.length === 0) {
      const reply =
        turn.message ?? 'I could not produce a response. Please try again.'
      if (!streamed) {
        onEvent?.({type: 'assistant', message: reply})
      }
      return reply
    }

    messages.push({
      role: 'assistant',
      content: turn.message ?? '',
      tool_calls: turn.toolCalls,
    })

    for (const call of turn.toolCalls) {
      onEvent?.({type: 'tool_start', tool: call.name, args: call.arguments})
      let summary: string
      try {
        summary = await executeAgentTool(umpire, call.name, call.arguments)
      } catch (err) {
        summary = err instanceof Error ? err.message : 'Tool execution failed'
      }
      onEvent?.({type: 'tool_end', tool: call.name, summary})
      messages.push({
        role: 'tool',
        content: summary,
        tool_call_id: call.id,
        name: call.name,
      })
    }
  }

  const fallback =
    'Reached the maximum number of tool calls. Please narrow your question.'
  onEvent?.({type: 'assistant', message: fallback})
  return fallback
}

export type {AgentConfig, AgentEvent, ChatMessage, LlmConfig, UmpireCaller}
