import type {FastifyInstance} from 'fastify'
import type {AgentSettingsUpdate} from '../agent/settings-store.js'
import {getAgentSettingsPublic} from '../agent/resolve.js'
import {getCore} from '../core/index.js'
import type {AgentLlmProvider, AgentSettings} from '../plugins/types.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const agentSettingsSchema = {
  type: 'object',
  required: [
    'enabled',
    'provider',
    'model',
    'base_url',
    'has_api_key',
    'max_tool_rounds',
    'request_extras',
    'configured',
    'config_source',
  ],
  properties: {
    enabled: {type: 'boolean'},
    provider: {
      type: 'string',
      enum: ['openai', 'anthropic', 'ollama', 'vllm'],
    },
    model: {type: 'string'},
    base_url: {type: ['string', 'null']},
    has_api_key: {type: 'boolean'},
    max_tool_rounds: {type: 'integer', minimum: 1, maximum: 20},
    request_extras: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: true,
      },
    },
    configured: {type: 'boolean'},
    config_source: {
      type: 'string',
      enum: ['database', 'environment', 'none'],
    },
  },
} as const

export async function agentSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/agent/settings',
    {
      schema: {
        tags: ['agent'],
        summary: 'Get AI agent LLM configuration (admin)',
        response: {
          200: agentSettingsSchema,
        },
      },
    },
    async (): Promise<AgentSettings> => getAgentSettingsPublic(),
  )

  app.put<{
    Body: {
      enabled?: boolean
      provider?: AgentLlmProvider
      model?: string
      base_url?: string | null
      api_key?: string
      max_tool_rounds?: number
      request_extras?: Record<string, Record<string, unknown>>
    }
  }>(
    '/api/agent/settings',
    {
      schema: {
        tags: ['agent'],
        summary: 'Update AI agent LLM configuration (admin)',
        body: {
          type: 'object',
          properties: {
            enabled: {type: 'boolean'},
            provider: {
              type: 'string',
              enum: ['openai', 'anthropic', 'ollama', 'vllm'],
            },
            model: {type: 'string'},
            base_url: {type: ['string', 'null']},
            api_key: {type: 'string'},
            max_tool_rounds: {type: 'integer', minimum: 1, maximum: 20},
            request_extras: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
        },
        response: {
          200: agentSettingsSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        getCore().updateStoredAgentSettings(req.body as AgentSettingsUpdate)
        return getAgentSettingsPublic()
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )
}
