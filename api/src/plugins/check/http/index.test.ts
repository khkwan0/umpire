import { jest } from '@jest/globals'
import httpCheck from './index.js'
import * as cfg from './config.js'

describe('http check plugin', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns ok=true for HTTP 200', async () => {
    jest.spyOn(cfg, 'readConfig').mockReturnValue({
      method: 'GET',
      headers: {},
      body: '',
    })
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
    } as Response)

    const result = await httpCheck.check('https://example.com')
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.error).toBeNull()
  })

  it('returns ok=false for non-200 responses', async () => {
    jest.spyOn(cfg, 'readConfig').mockReturnValue({
      method: 'GET',
      headers: {},
      body: '',
    })
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 500,
    } as Response)

    const result = await httpCheck.check('https://example.com')
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(500)
    expect(result.error).toBe('HTTP 500')
  })

  it('maps abort errors to timeout', async () => {
    jest.spyOn(cfg, 'readConfig').mockReturnValue({
      method: 'GET',
      headers: {},
      body: '',
    })
    const err = new Error('aborted')
    err.name = 'AbortError'
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(err)

    const result = await httpCheck.check('https://example.com')
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBeNull()
    expect(result.error).toBe('timeout')
  })

  it('uses configured method, headers, and body', async () => {
    jest.spyOn(cfg, 'readConfig').mockReturnValue({
      method: 'POST',
      headers: { 'x-test': 'ok' },
      body: '{"ping":true}',
    })
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
    } as Response)

    await httpCheck.check('https://example.com')

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
})
