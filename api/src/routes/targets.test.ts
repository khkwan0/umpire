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
}

const scheduler = {
  reschedule: jest.fn(),
}

jest.unstable_mockModule('../core/index.js', () => ({
  getCore: () => core,
}))

jest.unstable_mockModule('../plugins/registry.js', () => ({
  getScheduler: () => scheduler,
}))

const {targetsRoutes} = await import('./targets.js')

describe('targets routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
        url: 'not-a-url',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(core.createTarget).not.toHaveBeenCalled()
    expect(scheduler.reschedule).not.toHaveBeenCalled()
    await app.close()
  })
})
