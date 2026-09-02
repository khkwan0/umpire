import type {FastifyInstance} from 'fastify'
import {getCore} from '../core/index.js'
import {getAuth} from '../plugins/runtime.js'
import {isPluginEnabled} from '../plugins/manager.js'

const policySchema = {
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
} as const

/** True when an auth plugin is loaded and enabled in plugin manager (runtime). */
export function isAuthPluginActive(): boolean {
  const plugin = getAuth()
  if (!plugin) return false
  return isPluginEnabled('auth', plugin.id)
}

export function authPolicyPayload() {
  if (!isAuthPluginActive()) {
    return {
      auth_enabled: false,
      allow_readonly_without_auth: false,
      login_required: false,
      user_count: 0,
    }
  }
  const store = getCore()
  const allowReadonly = store.getAllowReadonlyWithoutAuth()
  return {
    auth_enabled: true,
    allow_readonly_without_auth: allowReadonly,
    login_required: !allowReadonly,
    user_count: store.countUsers(),
  }
}

/** Single policy route — reflects current plugin-manager auth state without restart. */
export async function registerAuthPolicyRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get('/api/auth/policy', {schema: policySchema}, async () =>
    authPolicyPayload(),
  )
}
