import { jest } from '@jest/globals'
import { aggregateCheckOutcomes, alertCopy, shouldAlert } from './alert.js'
import type { AlertCheckOutcome } from './plugins/types.js'

const check = (
  partial: Partial<AlertCheckOutcome> & Pick<AlertCheckOutcome, 'id' | 'ok'>,
): AlertCheckOutcome => ({
  statusCode: partial.ok ? 200 : 500,
  error: partial.ok ? null : 'failed',
  latencyMs: 10,
  ...partial,
})

describe('shouldAlert', () => {
  describe('every_fail', () => {
    it('alerts on down or partial, never on up', () => {
      expect(
        shouldAlert({
          policy: 'every_fail',
          throttleMinutes: 30,
          previous: 'up',
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'every_fail',
          throttleMinutes: 30,
          previous: 'down',
          now: 'partial',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'every_fail',
          throttleMinutes: 30,
          previous: 'down',
          now: 'up',
          lastAlertAt: null,
        }),
      ).toBe(false)
    })
  })

  describe('state_change', () => {
    it('alerts on first check when not up', () => {
      expect(
        shouldAlert({
          policy: 'state_change',
          throttleMinutes: 30,
          previous: null,
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'state_change',
          throttleMinutes: 30,
          previous: null,
          now: 'up',
          lastAlertAt: null,
        }),
      ).toBe(false)
    })

    it('alerts only when health changes', () => {
      expect(
        shouldAlert({
          policy: 'state_change',
          throttleMinutes: 30,
          previous: 'up',
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'state_change',
          throttleMinutes: 30,
          previous: 'down',
          now: 'up',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'state_change',
          throttleMinutes: 30,
          previous: 'down',
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(false)
    })
  })

  describe('throttle', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })
    it('alerts on first failure and on recovery', () => {
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: null,
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'up',
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'up',
          lastAlertAt: '2020-01-01T00:00:00.000Z',
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: null,
          now: 'up',
          lastAlertAt: null,
        }),
      ).toBe(false)
    })

    it('alerts when switching between down and partial', () => {
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'partial',
          lastAlertAt: new Date().toISOString(),
        }),
      ).toBe(true)
    })

    it('alerts again only after the throttle window', () => {
      const now = Date.parse('2026-01-01T12:00:00.000Z')
      jest.spyOn(Date, 'now').mockReturnValue(now)

      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'down',
          lastAlertAt: '2026-01-01T11:40:00.000Z',
        }),
      ).toBe(false)
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'down',
          lastAlertAt: '2026-01-01T11:30:00.000Z',
        }),
      ).toBe(true)
    })

    it('treats SQLite datetime (no timezone) as UTC', () => {
      const now = Date.parse('2026-01-01T12:00:00.000Z')
      jest.spyOn(Date, 'now').mockReturnValue(now)

      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'down',
          lastAlertAt: '2026-01-01 11:30:00',
        }),
      ).toBe(true)
    })

    it('alerts when lastAlertAt is missing or unparsable', () => {
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'down',
          lastAlertAt: null,
        }),
      ).toBe(true)
      expect(
        shouldAlert({
          policy: 'throttle',
          throttleMinutes: 30,
          previous: 'down',
          now: 'down',
          lastAlertAt: 'not-a-date',
        }),
      ).toBe(true)
    })
  })
})

describe('alertCopy', () => {
  it('describes recovered, partial, and down states', () => {
    expect(alertCopy('up', 'https://a.test', null)).toEqual({
      title: 'Site recovered',
      body: 'https://a.test is back up',
    })
    expect(alertCopy('partial', 'https://a.test', 'http failed')).toEqual({
      title: 'Site partial',
      body: 'https://a.test partial: http failed',
    })
    expect(alertCopy('partial', 'https://a.test', null)).toEqual({
      title: 'Site partial',
      body: 'https://a.test partial: some checks failed',
    })
    expect(alertCopy('down', 'https://a.test', 'timeout')).toEqual({
      title: 'Site down',
      body: 'https://a.test failed: timeout',
    })
    expect(alertCopy('down', 'https://a.test', null)).toEqual({
      title: 'Site down',
      body: 'https://a.test failed: unknown error',
    })
  })
})

describe('aggregateCheckOutcomes', () => {
  it('is down when no checks ran', () => {
    expect(aggregateCheckOutcomes([])).toEqual({
      status: 'down',
      statusCode: null,
      error: 'no check plugins loaded',
      latencyMs: 0,
      checks: [],
    })
  })

  it('is up when every check passed, using max latency', () => {
    const outcomes = [
      check({ id: 'http', ok: true, statusCode: 200, latencyMs: 12 }),
      check({ id: 'dns', ok: true, statusCode: null, latencyMs: 40 }),
    ]
    expect(aggregateCheckOutcomes(outcomes)).toEqual({
      status: 'up',
      statusCode: 200,
      error: null,
      latencyMs: 40,
      checks: outcomes,
    })
  })

  it('is down when every check failed, prefixing plugin ids', () => {
    const outcomes = [
      check({ id: 'http', ok: false, statusCode: 503, error: 'HTTP 503' }),
      check({ id: 'dns', ok: false, statusCode: null, error: 'timeout' }),
    ]
    expect(aggregateCheckOutcomes(outcomes)).toEqual({
      status: 'down',
      statusCode: 503,
      error: '[http] HTTP 503; [dns] timeout',
      latencyMs: 10,
      checks: outcomes,
    })
  })

  it('is partial on mixed results', () => {
    const outcomes = [
      check({ id: 'http', ok: true, latencyMs: 5 }),
      check({ id: 'tls', ok: false, error: 'expired', latencyMs: 8 }),
    ]
    expect(aggregateCheckOutcomes(outcomes)).toEqual({
      status: 'partial',
      statusCode: 500,
      error: '[tls] expired',
      latencyMs: 8,
      checks: outcomes,
    })
  })

  it('uses a default error when a failed check has none', () => {
    expect(
      aggregateCheckOutcomes([check({ id: 'http', ok: false, error: null })])
        .error,
    ).toBe('[http] failed')
  })
})
