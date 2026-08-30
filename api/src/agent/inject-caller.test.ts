import Fastify from 'fastify'
import {
  createInjectCaller,
  headerValue,
  injectAuthFromRequest,
  injectPayload,
} from './inject-caller.js'

describe('inject-caller helpers', () => {
  it('normalizes string and array headers', () => {
    expect(headerValue(undefined)).toBeUndefined()
    expect(headerValue('')).toBeUndefined()
    expect(headerValue('umpire_session=abc')).toBe('umpire_session=abc')
    expect(headerValue(['a=1', 'b=2'])).toBe('a=1; b=2')
    expect(headerValue(['Bearer t'], ', ')).toBe('Bearer t')
  })

  it('parses JSON string bodies for inject', () => {
    expect(injectPayload(undefined)).toBeUndefined()
    expect(injectPayload('')).toBeUndefined()
    expect(injectPayload('{"enabled":false}')).toEqual({enabled: false})
    expect(injectPayload({enabled: true})).toEqual({enabled: true})
    expect(injectPayload('not-json')).toBe('not-json')
  })

  it('reads cookie and Authorization from the request', () => {
    expect(
      injectAuthFromRequest({
        headers: {
          cookie: 'umpire_session=abc',
          authorization: 'Bearer tok',
        },
      } as never),
    ).toEqual({
      cookie: 'umpire_session=abc',
      authorization: 'Bearer tok',
    })
  })
})

describe('createInjectCaller', () => {
  it('forwards session auth, JSON content-type, and parsed string bodies', async () => {
    const app = Fastify()
    let seen: {
      cookie?: string
      authorization?: string
      contentType?: string
      body?: unknown
    } = {}
    app.patch('/api/targets/:id', async req => {
      seen = {
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: req.body,
      }
      return {id: Number((req.params as {id: string}).id), enabled: false}
    })
    await app.ready()

    const caller = createInjectCaller(app, {
      cookie: 'umpire_session=abc',
      authorization: 'Bearer tok',
    })
    const result = await caller('PATCH', '/api/targets/7', {
      body: '{"enabled":false}',
    })

    expect(result).toEqual({id: 7, enabled: false})
    expect(seen.cookie).toBe('umpire_session=abc')
    expect(seen.authorization).toBe('Bearer tok')
    expect(seen.contentType).toMatch(/application\/json/)
    expect(seen.body).toEqual({enabled: false})
    await app.close()
  })

  it('surfaces API error messages from failed writes', async () => {
    const app = Fastify()
    app.patch('/api/targets/:id', async (_req, reply) => {
      return reply.code(403).send({error: 'Write access required'})
    })
    await app.ready()

    const caller = createInjectCaller(app, {})
    await expect(
      caller('PATCH', '/api/targets/1', {body: {enabled: false}}),
    ).rejects.toThrow('Write access required')
    await app.close()
  })
})
