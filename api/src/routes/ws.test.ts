import {jest} from '@jest/globals'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import {registerOpenApi} from '../openapi.js'
import {healthRoutes} from './health.js'

const core = {
  resolveSessionPrincipal: jest.fn(() => null),
  resolveApiTokenPrincipal: jest.fn(() => null),
  anonymousReadOnlyPrincipal: () => ({
    kind: 'anonymous' as const,
    user: null,
    is_admin: false,
    can_write: false,
    plugins: 'all' as const,
  }),
}

let authPluginActive = false

const rbacPublicPaths = new Set([
  '/api/health',
  '/api/auth/policy',
  '/api/auth/login',
  '/api/auth/logout',
])

const mockAuthPlugin = {
  id: 'rbac',
  publicPaths: () => rbacPublicPaths,
  resolvePrincipal: () => null,
  evaluateAccess: () => ({ok: true as const}),
}

jest.unstable_mockModule('../core/index.js', () => ({
  getCore: () => core,
}))

jest.unstable_mockModule('../auth/active.js', () => ({
  initAuthActiveState: () => {},
  isAuthPluginActive: () => authPluginActive,
}))

jest.unstable_mockModule('../plugins/manager.js', () => ({
  isPluginEnabled: (_kind: string, _id: string) => authPluginActive,
}))

jest.unstable_mockModule('../plugins/runtime.js', () => ({
  getAuth: () => (authPluginActive ? mockAuthPlugin : undefined),
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
    jest.clearAllMocks()
    authPluginActive = false
  })

  it('proxies API calls in open mode with anonymous admin', async () => {
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
        username: null,
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

  it('defers WS handshake auth; rejects blocked paths and unauthenticated writes', async () => {
    authPluginActive = true
    const app = Fastify()
    await registerOpenApi(app)
    await registerAuthGate(app)
    await app.register(websocket)
    await app.register(healthRoutes)
    await app.register(wsRoutes)
    await app.ready()

    const unauthSocket = await app.injectWS('/api/ws')
    const unauthHello = await waitForMessage(
      unauthSocket,
      msg => msg.type === 'connected',
    )
    expect(unauthHello).toMatchObject({
      type: 'connected',
      auth: null,
    })

    const unauthWritePromise = waitForMessage(
      unauthSocket,
      msg => msg.id === 'unauth-write',
    )
    unauthSocket.send(
      JSON.stringify({
        id: 'unauth-write',
        method: 'POST',
        path: '/api/targets',
        body: {url: 'https://example.com', interval_seconds: 60},
      }),
    )
    expect(await unauthWritePromise).toMatchObject({
      id: 'unauth-write',
      status: 401,
      body: {error: 'Authentication required'},
    })
    unauthSocket.terminate()

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
