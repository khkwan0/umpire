import Fastify from 'fastify'
import {healthRoutes} from './health.js'

describe('health route', () => {
  it('returns ok=true', async () => {
    const app = Fastify()
    await app.register(healthRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ok: true})
    await app.close()
  })
})
