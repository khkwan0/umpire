#!/usr/bin/env node
import * as readline from 'node:readline/promises'
import {stdin as input, stdout as output} from 'node:process'
import {UmpireClient, loadUmpireConfig} from './client.js'
import {runAgentChat} from './runner.js'
import type {ChatMessage} from './types.js'
import {agentConfigured, loadLlmConfig} from './types.js'

async function chatLoop(): Promise<void> {
  const llm = loadLlmConfig()
  if (!llm) {
    console.error(
      'LLM not configured. Set OPENAI_API_KEY (and optionally OPENAI_MODEL, OPENAI_BASE_URL) or ANTHROPIC_API_KEY with AGENT_LLM_PROVIDER=anthropic.',
    )
    process.exit(1)
  }

  const umpireCfg = loadUmpireConfig()
  const client = new UmpireClient(umpireCfg.baseUrl, umpireCfg.apiToken)
  const caller = client.asCaller()

  console.log(`UMPIRE agent (${llm.provider}/${llm.model})`)
  console.log(`API: ${umpireCfg.baseUrl}`)
  console.log('Type a question, or "exit" to quit.\n')

  const history: ChatMessage[] = []
  const rl = readline.createInterface({input, output})

  try {
    while (true) {
      const line = (await rl.question('you> ')).trim()
      if (!line) continue
      if (line === 'exit' || line === 'quit') break

      process.stdout.write('\n')
      try {
        const reply = await runAgentChat({
          llm,
          umpire: caller,
          userMessage: line,
          history,
          onEvent: event => {
            if (event.type === 'tool_start') {
              console.log(`  [tool] ${event.tool}`, JSON.stringify(event.args))
            } else if (event.type === 'tool_end') {
              const preview = event.summary.slice(0, 120).replace(/\n/g, ' ')
              console.log(`  [done] ${event.tool}: ${preview}…`)
            }
          },
        })
        history.push({role: 'user', content: line})
        history.push({role: 'assistant', content: reply})
        console.log(`\nassistant> ${reply}\n`)
      } catch (err) {
        console.error(
          `\nerror> ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
    }
  } finally {
    rl.close()
  }
}

const cmd = process.argv[2] ?? 'chat'

if (cmd === 'chat') {
  void chatLoop()
} else if (cmd === 'status') {
  const llm = loadLlmConfig()
  const umpire = loadUmpireConfig()
  console.log(
    JSON.stringify(
      {
        agent_configured: agentConfigured(),
        llm: llm
          ? {provider: llm.provider, model: llm.model}
          : null,
        umpire_base_url: umpire.baseUrl,
        has_api_token: Boolean(umpire.apiToken),
      },
      null,
      2,
    ),
  )
} else {
  console.error(`Unknown command: ${cmd}\nUsage: umpire-agent [chat|status]`)
  process.exit(1)
}
