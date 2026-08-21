import {jest} from '@jest/globals'
import Fastify from 'fastify'
import type {Target} from '../core/types.js'
import {registerOpenApi} from '../openapi.js'

const core = {
  listTargets: jest.fn(),
  createTarget: jest.fn(),
  updateTarget: jest.fn(),
  deleteTarget: jest.fn(),
  getTarget: jest.fn(),
  listRecentResults: jest.fn(),
  getTargetNotifierConfig: jest.fn(),
  setTargetNotifierConfig: jest.fn(),
  deleteTargetNotifierConfig: jest.fn(),
  listAllTargetNotifierConfigs: jest.fn(),
}

const scheduler = {
  reschedule: jest.fn(),
}

let mockChecks: Array<{
  id: string
  evaluateTarget?: (params: {
    url: string
    interval_seconds: number
    group_id: number | null
  }) => {ok: true} | {ok: false; reason: string}
  check: () => Promise<{
    ok: boolean
    statusCode: number | null
    error: string | null
    latencyMs: number
  }>
}> = []

jest.unstable_mockModule('../core/index.js', () => ({
  getCore: () => core,
}))

jest.unstable_mockModule('../plugins/registry.js', () => ({
  getScheduler: () => scheduler,
  getChecks: () => mockChecks,
  getNotifiers: () => [{id: 'webhook', isReady: () => true}],
}))

const {targetsRoutes} = await import('./targets.js')

describe('targets routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChecks = []
  })

  it('creates a target and triggers scheduler reschedule', async () => {
    const created: Target = {
      id: 1,
      url: 'https://example.com',
      interval_seconds: 60,
      enabled: 1,
      group_id: null,
      check_ids: [],
      notifier_ids: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    core.createTarget.mockReturnValue(created)

    const app = Fastify()
    await registerOpenApi(app)
    await app.register(targetsRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/targets',
      payload: {
        url: 'https://example.com',
        interval_seconds: 60,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual(created)
    expect(core.createTarget).toHaveBeenCalledWith(
      'https://example.com',
      60,
      true,
      null,
      [],
      [],
    )
    expect(scheduler.reschedule).toHaveBeenCalledTimes(1)
    await app.close()
  })

  it('rejects invalid URLs', async () => {
    const app = Fastify()
    await registerOpenApi(app)
    await app.register(targetsRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/targets',
      payload: {
        url: 'not a host',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(core.createTarget).not.toHaveBeenCalled()
    expect(scheduler.reschedule).not.toHaveBeenCalled()
    await app.close()
  })

  it('creates a target from a bare hostname', async () => {
    const created: Target = {
      id: 2,
      url: 'example.com',
      interval_seconds: 60,
      enabled: 1,
      group_id: null,
      check_ids: ['ping'],
      notifier_ids: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    core.createTarget.mockReturnValue(created)

    const app = Fastify()
    await registerOpenApi(app)
    await app.register(targetsRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/targets',
      payload: {
        url: 'example.com',
        interval_seconds: 60,
        check_ids: ['ping'],
      },
    })

    expect(res.statusCode).toBe(201)
    expect(core.createTarget).toHaveBeenCalledWith(
      'example.com',
      60,
      true,
      null,
      ['ping'],
      [],
    )
    await app.close()
  })

  it('evaluates check compatibility for draft target params', async () => {
    const app = Fastify()
    await registerOpenApi(app)
    await app.register(targetsRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/targets/evaluate-checks',
      payload: {url: '8.8.8.8', interval_seconds: 60},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({checks: []})
    await app.close()
  })

  it('rejects creating a target with an incompatible check allowlist', async () => {
    mockChecks = [
      {
        id: 'http',
        evaluateTarget: ({url}) =>
          url.includes('://')
            ? {ok: true}
            : {ok: false, reason: 'requires an http:// or https:// URL'},
        check: async () => ({
          ok: true,
          statusCode: 200,
          error: null,
          latencyMs: 1,
        }),
      },
    ]

    const app = Fastify()
    await registerOpenApi(app)
    await app.register(targetsRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/targets',
      payload: {
        url: '8.8.8.8',
        check_ids: ['http'],
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/incompatible/)
    expect(core.createTarget).not.toHaveBeenCalled()
    await app.close()
  })

  it('saves a core notifier check allowlist', async () => {
    const row: Target = {
      id: 1,
      url: 'https://example.com',
      interval_seconds: 60,
      enabled: 1,
      group_id: null,
      check_ids: [],
      notifier_ids: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    core.getTarget.mockReturnValue(row)
    core.getTargetNotifierConfig.mockReturnValue(null)

    const app = Fastify()
    await registerOpenApi(app)
    await app.register(targetsRoutes)

    const res = await app.inject({
      method: 'PUT',
      url: '/api/targets/1/notifiers/webhook/check-ids',
      payload: {check_ids: ['http']},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({check_ids: ['http']})
    expect(core.setTargetNotifierConfig).toHaveBeenCalledWith(1, 'webhook', {
      check_ids: ['http'],
    })
    await app.close()
  })
})
