import {jest} from '@jest/globals'
import httpCheck from './index.js'

const target = {
  id: 1,
  url: 'https://example.com',
  interval_seconds: 60,
  enabled: 1,
  group_id: null,
  check_ids: ['http'],
  notifier_ids: [],
  created_at: '',
  updated_at: '',
}

describe('http check plugin', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns ok=true for HTTP 200', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
    } as Response)

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: ['2xx'],
        acceptedStatusCodes: [],
        maxLatencyMs: null,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.error).toBeNull()
  })

  it('returns ok=false when status is outside accepted ranges', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 500,
    } as Response)

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: ['2xx'],
        acceptedStatusCodes: [],
        maxLatencyMs: null,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(500)
    expect(result.error).toContain('outside accepted status')
  })

  it('maps abort errors to timeout', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(err)

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: ['2xx'],
        acceptedStatusCodes: [],
        maxLatencyMs: null,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBeNull()
    expect(result.error).toBe('timeout')
  })

  it('uses configured method, headers, and body', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
    } as Response)

    await httpCheck.check({
      target,
      config: {
        method: 'POST',
        headers: {'x-test': 'ok'},
        body: '{"ping":true}',
        acceptedStatusRanges: ['2xx', '3xx'],
        acceptedStatusCodes: [],
        maxLatencyMs: null,
      },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'POST',
        body: '{"ping":true}',
        headers: expect.objectContaining({
          'user-agent': 'umpire/1.0',
          'x-test': 'ok',
        }),
      }),
    )
  })

  it('accepts configured status ranges', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 302,
    } as Response)

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: ['2xx', '3xx'],
        acceptedStatusCodes: [],
        maxLatencyMs: null,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(302)
    expect(result.error).toBeNull()
  })

  it('fails when latency exceeds max latency threshold', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Promise<Response>(resolve => {
          setTimeout(() => resolve({status: 200} as Response), 5)
        }),
    )

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: ['2xx'],
        acceptedStatusCodes: [],
        maxLatencyMs: 1,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(200)
    expect(result.error).toContain('exceeds')
  })

  it('accepts specific status codes without matching range', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 418,
    } as Response)

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: [],
        acceptedStatusCodes: [418],
        maxLatencyMs: null,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(418)
  })

  it('accepts status code listed alongside ranges', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 204,
    } as Response)

    const result = await httpCheck.check({
      target,
      config: {
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: [],
        acceptedStatusCodes: [200, 204],
        maxLatencyMs: null,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(204)
  })
})
