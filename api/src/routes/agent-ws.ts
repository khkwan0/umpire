import type {FastifyInstance, LightMyRequestResponse} from 'fastify'
import type {WebSocket} from 'ws'
import {runAgentChat, type ChatMessage, type UmpireCaller} from 'umpire-agent'
import {getAgentLlmConfig, getAgentSettingsPublic} from '../agent/resolve.js'
import {getAuthContext, type AuthRequest} from '../auth/index.js'

type ChatFrame = {
  type?: unknown
  id?: unknown
  message?: unknown
  history?: unknown
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(payload))
}

function buildInjectUrl(
  path: string,
  query?: Record<string, string | number | boolean>,
): string {
  if (!query || Object.keys(query).length === 0) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    params.set(k, String(v))
  }
  const q = params.toString()
  return q ? `${path}?${q}` : path
}

function createInjectCaller(
  app: FastifyInstance,
  cookie?: string,
): UmpireCaller {
  return async (method, path, opts) => {
    const url = buildInjectUrl(path, opts?.query)
    const upper = method.toUpperCase()
    const hasBody =
      opts?.body !== undefined && upper !== 'GET' && upper !== 'HEAD'
    const res = (await app.inject({
      method: upper as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url,
      headers: cookie ? {cookie} : {},
      payload: hasBody ? (opts!.body as object | string) : undefined,
    })) as LightMyRequestResponse
    let body: unknown = res.body
    if (res.headers['content-type']?.includes('application/json') && res.body) {
      try {
        body = JSON.parse(res.body)
      } catch {
        body = res.body
      }
    }
    if (res.statusCode >= 400) {
      const errMsg =
        body &&
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as {error: unknown}).error === 'string'
          ? (body as {error: string}).error
          : `HTTP ${res.statusCode}`
      throw new Error(errMsg)
    }
    return body
  }
}

function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ChatMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const role = (item as {role?: unknown}).role
    const content = (item as {content?: unknown}).content
    if (
      (role === 'user' || role === 'assistant') &&
      typeof content === 'string'
    ) {
      out.push({role, content})
    }
  }
  return out.slice(-20)
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/agent/status',
    {
      schema: {
        tags: ['agent'],
        summary: 'Agent LLM configuration status',
        response: {
          200: {
            type: 'object',
            required: ['enabled', 'configured'],
            properties: {
              enabled: {type: 'boolean'},
              configured: {type: 'boolean'},
              provider: {type: ['string', 'null']},
              model: {type: ['string', 'null']},
            },
          },
        },
      },
    },
    async () => {
      const settings = getAgentSettingsPublic()
      return {
        enabled: settings.enabled,
        configured: settings.configured,
        provider: settings.configured ? settings.provider : null,
        model: settings.configured ? settings.model : null,
      }
    },
  )

  app.get(
    '/api/agent/ws',
    {
      websocket: true,
      schema: {
        tags: ['agent'],
        summary: 'WebSocket chat with the UMPIRE AI agent',
        hide: true,
      },
    },
    (socket, req) => {
      const cookie =
        typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined
      const caller = createInjectCaller(app, cookie)

      setImmediate(() => {
        const settings = getAgentSettingsPublic()
        sendJson(socket, {
          type: 'ready',
          enabled: settings.enabled,
          configured: settings.configured,
          provider: settings.configured ? settings.provider : null,
          model: settings.configured ? settings.model : null,
        })
      })

      socket.on('message', raw => {
        const text =
          typeof raw === 'string'
            ? raw
            : Buffer.isBuffer(raw)
              ? raw.toString('utf8')
              : Buffer.concat(raw as Buffer[]).toString('utf8')

        void (async () => {
          let frame: ChatFrame
          try {
            frame = JSON.parse(text) as ChatFrame
          } catch {
            sendJson(socket, {
              type: 'error',
              id: '',
              error: 'Invalid JSON frame',
            })
            return
          }

          const type = typeof frame.type === 'string' ? frame.type : ''
          const id = typeof frame.id === 'string' ? frame.id : ''

          if (type === 'ping') {
            sendJson(socket, {type: 'pong', id})
            return
          }

          if (type !== 'chat') {
            sendJson(socket, {
              type: 'error',
              id,
              error: 'Unknown frame type',
            })
            return
          }

          const message =
            typeof frame.message === 'string' ? frame.message.trim() : ''
          if (!message) {
            sendJson(socket, {
              type: 'error',
              id,
              error: 'message is required',
            })
            return
          }

          const auth = getAuthContext(req as AuthRequest)
          if (!auth) {
            sendJson(socket, {
              type: 'error',
              id,
              error: 'Authentication required',
            })
            return
          }

          const settings = getAgentSettingsPublic()
          if (!settings.enabled) {
            sendJson(socket, {
              type: 'error',
              id,
              error: 'AI agent is disabled. Enable it in Settings → AI Agent.',
            })
            return
          }

          const {llm: llmConfig} = getAgentLlmConfig()
          if (!llmConfig) {
            sendJson(socket, {
              type: 'error',
              id,
              error:
                'Agent LLM not configured. Configure it in Settings → AI Agent.',
            })
            return
          }

          sendJson(socket, {type: 'started', id})

          try {
            const reply = await runAgentChat({
              llm: llmConfig,
              umpire: caller,
              userMessage: message,
              history: parseHistory(frame.history),
              onEvent: event => {
                if (event.type === 'tool_start') {
                  sendJson(socket, {
                    type: 'tool_start',
                    id,
                    tool: event.tool,
                    args: event.args,
                  })
                } else if (event.type === 'tool_end') {
                  sendJson(socket, {
                    type: 'tool_end',
                    id,
                    tool: event.tool,
                    summary: event.summary.slice(0, 8000),
                  })
                } else if (event.type === 'assistant') {
                  sendJson(socket, {
                    type: 'assistant',
                    id,
                    message: event.message,
                  })
                }
              },
            })
            sendJson(socket, {type: 'done', id, message: reply})
          } catch (err) {
            sendJson(socket, {
              type: 'error',
              id,
              error: err instanceof Error ? err.message : 'Agent failed',
            })
          }
        })()
      })
    },
  )
}
