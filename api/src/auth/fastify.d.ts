import type {AuthPrincipal} from '../plugins/types.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPrincipal
  }
}

export {}
