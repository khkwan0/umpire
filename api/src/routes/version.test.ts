import Fastify from 'fastify'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {versionRoutes} from './version.js'

const expected = (
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    version: string
  }
).version

describe('version route', () => {
  it('returns the api package version', async () => {
    const app = Fastify()
    await app.register(versionRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/version',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({api: expected})
    await app.close()
  })
})
