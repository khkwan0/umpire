import { jest } from '@jest/globals'
import { sendAlert, testEvent } from './send.js'
import type { WebhookConfig } from './config.js'

const event = {
  ...testEvent(),
  checkedAt: '2026-01-01T00:00:00.000Z',
}

describe('sendAlert', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('rejects an unconfigured webhook', async () => {
    await expect(
      sendAlert({ url: '', method: 'POST', headers: {} }, event),
    ).rejects.toThrow('webhook URL is not configured')
  })

  it('POSTs JSON and sets content-type when missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })
    const config: WebhookConfig = {
      url: 'https://hooks.test/alert',
      method: 'POST',
      headers: { 'X-Token': 'a' },
    }
    await sendAlert(config, event)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://hooks.test/alert')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'X-Token': 'a',
        'content-type': 'application/json',
      },
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      title: event.title,
      status: 'down',
    })
  })

  it('puts the payload on the query string for GET', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })
    await sendAlert(
      { url: 'https://hooks.test/alert', method: 'GET', headers: {} },
      event,
    )
    const calledUrl = new URL(fetchMock.mock.calls[0]![0] as string)
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://hooks.test/alert')
    expect(calledUrl.searchParams.get('title')).toBe(event.title)
    expect(calledUrl.searchParams.get('status')).toBe('down')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      body: undefined,
    })
  })

  it('throws on non-OK HTTP responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    })
    await expect(
      sendAlert(
        { url: 'https://hooks.test/alert', method: 'POST', headers: {} },
        event,
      ),
    ).rejects.toThrow('webhook HTTP 502: bad gateway')
  })
})

describe('testEvent', () => {
  it('returns a sample down alert', () => {
    const sample = testEvent()
    expect(sample.status).toBe('down')
    expect(sample.title).toContain('webhook test')
    expect(sample.checks).toEqual([])
  })
})
