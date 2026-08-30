import type {FastifyInstance} from 'fastify'
import {resolveAgentChatOwner} from '../agent/chat-owner.js'
import {getCore} from '../core/index.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const agentChatSchema = {
  type: 'object',
  required: ['id', 'title', 'created_at', 'updated_at'],
  properties: {
    id: {type: 'string'},
    title: {type: 'string'},
    created_at: {type: 'string'},
    updated_at: {type: 'string'},
  },
} as const

const agentChatMessageSchema = {
  type: 'object',
  required: ['id', 'chat_id', 'role', 'content', 'reasoning', 'tools', 'created_at'],
  properties: {
    id: {type: 'string'},
    chat_id: {type: 'string'},
    role: {type: 'string', enum: ['user', 'assistant']},
    content: {type: 'string'},
    reasoning: {type: ['string', 'null']},
    tools: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {type: 'string'},
          summary: {type: 'string'},
        },
      },
    },
    created_at: {type: 'string'},
  },
} as const

export async function agentChatsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/agent/chats',
    {
      schema: {
        tags: ['agent'],
        summary: 'List agent chat sessions for the current user or owner key',
        response: {
          200: {type: 'array', items: agentChatSchema},
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const owner = resolveAgentChatOwner(req, reply)
      if (!owner) return
      return getCore().listAgentChats(owner.userId, owner.ownerKey)
    },
  )

  app.post<{Body: {title?: string}}>(
    '/api/agent/chats',
    {
      schema: {
        tags: ['agent'],
        summary: 'Create a new agent chat session',
        body: {
          type: 'object',
          properties: {title: {type: 'string'}},
        },
        response: {
          200: agentChatSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const owner = resolveAgentChatOwner(req, reply)
      if (!owner) return
      const title =
        typeof req.body?.title === 'string' ? req.body.title : undefined
      return getCore().createAgentChat(owner.userId, owner.ownerKey, title)
    },
  )

  app.get<{Params: {id: string}}>(
    '/api/agent/chats/:id',
    {
      schema: {
        tags: ['agent'],
        summary: 'Get an agent chat with full message history',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: {
            type: 'object',
            required: ['id', 'title', 'created_at', 'updated_at', 'messages'],
            properties: {
              ...agentChatSchema.properties,
              messages: {type: 'array', items: agentChatMessageSchema},
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const owner = resolveAgentChatOwner(req, reply)
      if (!owner) return
      const chat = getCore().getAgentChat(
        req.params.id,
        owner.userId,
        owner.ownerKey,
      )
      if (!chat) {
        return reply.code(404).send({error: 'Chat not found'})
      }
      return chat
    },
  )

  app.patch<{Params: {id: string}; Body: {title?: string}}>(
    '/api/agent/chats/:id',
    {
      schema: {
        tags: ['agent'],
        summary: 'Rename an agent chat session',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        body: {
          type: 'object',
          properties: {title: {type: 'string'}},
        },
        response: {
          200: agentChatSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const owner = resolveAgentChatOwner(req, reply)
      if (!owner) return
      const title =
        typeof req.body?.title === 'string' ? req.body.title : undefined
      if (title === undefined) {
        return reply.code(400).send({error: 'title is required'})
      }
      const chat = getCore().updateAgentChat(
        req.params.id,
        owner.userId,
        owner.ownerKey,
        {title},
      )
      if (!chat) {
        return reply.code(404).send({error: 'Chat not found'})
      }
      return chat
    },
  )

  app.delete<{Params: {id: string}}>(
    '/api/agent/chats/:id',
    {
      schema: {
        tags: ['agent'],
        summary: 'Delete an agent chat session and its messages',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: {ok: {type: 'boolean'}},
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const owner = resolveAgentChatOwner(req, reply)
      if (!owner) return
      const ok = getCore().deleteAgentChat(
        req.params.id,
        owner.userId,
        owner.ownerKey,
      )
      if (!ok) {
        return reply.code(404).send({error: 'Chat not found'})
      }
      return {ok: true}
    },
  )
}
