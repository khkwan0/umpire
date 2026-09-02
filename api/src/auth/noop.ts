import type {FastifyInstance} from 'fastify'

/** Public policy when no auth plugin is active (fully open mode). */
export async function registerNoAuthPolicyRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/api/auth/policy',
    {
      schema: {
        tags: ['auth'],
        summary: 'Public auth policy for UI gating',
        response: {
          200: {
            type: 'object',
            required: [
              'auth_enabled',
              'allow_readonly_without_auth',
              'login_required',
              'user_count',
            ],
            properties: {
              auth_enabled: {type: 'boolean'},
              allow_readonly_without_auth: {type: 'boolean'},
              login_required: {type: 'boolean'},
              user_count: {type: 'integer'},
            },
          },
        },
      },
    },
    async () => ({
      auth_enabled: false,
      allow_readonly_without_auth: false,
      login_required: false,
      user_count: 0,
    }),
  )
}
