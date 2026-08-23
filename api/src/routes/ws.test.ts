import {jest} from '@jest/globals'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import {registerOpenApi} from '../openapi.js'
import {healthRoutes} from './health.js'

const settings = {
  auth_enabled: false,
  allow_readonly_without_auth: false,
}

const core = {
  getSettings: () => settings,
  countUsers: () => 0,
  resolveSessionPrincipal: jest.fn(() => null),
  anonymousReadOnlyPrincipal: () => ({
    kind: 'anonymous' as const,
    user: null,
    is_admin: false,
    can_write: false,
    plugins: 'all' as const,
    single_user_mode: false,
  }),
}

jest.unstable_mockModule('../core/index.js', () => ({
  getCore: () => core,
}))

const {registerAuthGate} = await import('../auth/gate.js')
const {wsRoutes} = await import('./ws.js')

function waitForMessage(
  socket: {
    on: (event: string, cb: (data: Buffer) => void) => void
    once?: (event: string, cb: (data: Buffer) => void) => void
    removeListener?: (event: string, cb: (data: Buffer) => void) => void
  },
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timed out waiting for websocket message'))
    }, timeoutMs)

    const onMessage = (data: Buffer) => {
      const msg = JSON.parse(data.toString('utf8')) as Record<string, unknown>
      if (!predicate(msg)) return
      cleanup()
      resolve(msg)
    }

    const cleanup = () => {
      clearTimeout(timer)
      socket.removeListener?.('message', onMessage)
    }

    socket.on('message', onMessage)
  })
}

describe('websocket HTTP bridge', () => {
  beforeEach(() => {
    settings.auth_enabled = false
    settings.allow_readonly_without_auth = false
    jest.clearAllMocks()
  })

  it('proxies API calls including auth gate behavior', async () => {
    const app = Fastify()
    await registerOpenApi(app)
    await registerAuthGate(app)
    await app.register(websocket)
    await app.register(healthRoutes)
    await app.register(wsRoutes)
    await app.ready()

    const socket = await app.injectWS('/api/ws')
    const hello = await waitForMessage(socket, msg => msg.type === 'connected')
    expect(hello).toMatchObject({
      type: 'connected',
      auth: {
        kind: 'anonymous',
        is_admin: true,
        can_write: true,
      },
    })

    const responsePromise = waitForMessage(socket, msg => msg.id === 'health-1')
    socket.send(
      JSON.stringify({
        id: 'health-1',
        method: 'GET',
        path: '/api/health',
      }),
    )
    const res = await responsePromise
    expect(res).toMatchObject({
      id: 'health-1',
      status: 200,
      body: {ok: true},
    })

    socket.terminate()
    await app.close()
  })

  it('rejects blocked paths and requires auth when enabled', async () => {
    settings.auth_enabled = true

    const app = Fastify()
    await registerOpenApi(app)
    await registerAuthGate(app)
    await app.register(websocket)
    await app.register(healthRoutes)
    await app.register(wsRoutes)
    await app.ready()

    await expect(app.injectWS('/api/ws')).rejects.toThrow()

    settings.allow_readonly_without_auth = true
    const socket = await app.injectWS('/api/ws')
    await waitForMessage(socket, msg => msg.type === 'connected')

    const blockedPromise = waitForMessage(socket, msg => msg.id === 'blocked')
    socket.send(
      JSON.stringify({
        id: 'blocked',
        method: 'GET',
        path: '/api/stream',
      }),
    )
    expect(await blockedPromise).toMatchObject({
      id: 'blocked',
      status: 400,
      body: {error: 'path is not available over WebSocket'},
    })

    const writePromise = waitForMessage(socket, msg => msg.id === 'write')
    socket.send(
      JSON.stringify({
        id: 'write',
        method: 'POST',
        path: '/api/targets',
        body: {url: 'https://example.com', interval_seconds: 60},
      }),
    )
    expect(await writePromise).toMatchObject({
      id: 'write',
      status: 401,
      body: {error: 'Authentication required'},
    })

    socket.terminate()
    await app.close()
  })
})
