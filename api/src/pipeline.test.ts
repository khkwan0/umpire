import {jest} from '@jest/globals'
import type {
  CheckPlugin,
  NotifierPlugin,
  NotifyContext,
  Target,
} from './plugins/types.js'
import {setChecks, setNotifiers} from './plugins/runtime.js'

const store = {
  getTarget: jest.fn<(id: number) => Target | undefined>(),
  getTargetState: jest.fn(),
  getTargetCheckConfig: jest.fn(() => null),
  getTargetNotifierConfig: jest.fn(() => null),
  recordCheckResult: jest.fn(),
  getSettings: jest.fn(),
  markAlertSent: jest.fn(),
}

jest.unstable_mockModule('./core/index.js', () => ({
  getCore: () => store,
}))

const {runCheck} = await import('./pipeline.js')

function target(partial: Partial<Target> = {}): Target {
  return {
    id: 1,
    url: 'https://a.test',
    interval_seconds: 60,
    enabled: 1,
    group_id: null,
    check_ids: [],
    notifier_ids: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function checkPlugin(
  id: string,
  outcome: {ok: boolean; statusCode?: number | null; error?: string | null},
  evaluateTarget?: CheckPlugin['evaluateTarget'],
): CheckPlugin {
  return {
    id,
    evaluateTarget,
    check: jest.fn(async () => ({
      ok: outcome.ok,
      statusCode: outcome.statusCode ?? (outcome.ok ? 200 : 500),
      error: outcome.error ?? (outcome.ok ? null : 'failed'),
      latencyMs: 7,
    })),
  }
}

function notifierPlugin(
  id: string,
  notify: NotifierPlugin['notify'] = jest.fn(async () => {}),
): NotifierPlugin {
  return {
    id,
    isReady: () => true,
    notify,
  }
}

describe('runCheck', () => {
  beforeEach(() => {
    store.getTarget.mockReset()
    store.getTargetState.mockReset()
    store.getTargetCheckConfig.mockReset()
    store.getTargetNotifierConfig.mockReset()
    store.recordCheckResult.mockReset()
    store.getSettings.mockReset()
    store.markAlertSent.mockReset()
    store.getSettings.mockReturnValue({
      alert_policy: 'state_change',
      throttle_minutes: 30,
    })
    store.getTargetState.mockReturnValue(undefined)
    store.getTargetCheckConfig.mockReturnValue(null)
    store.getTargetNotifierConfig.mockReturnValue(null)
    setChecks([])
    setNotifiers([])
  })

  it('skips missing or paused targets', async () => {
    const http = checkPlugin('http', {ok: false})
    setChecks([http])
    store.getTarget.mockReturnValue(undefined)
    await runCheck(999)
    expect(http.check).not.toHaveBeenCalled()

    store.getTarget.mockReturnValue(target({enabled: 0}))
    await runCheck(1)
    expect(http.check).not.toHaveBeenCalled()
  })

  it('does not notify on first success under state_change', async () => {
    const notify = jest.fn(async () => {})
    setChecks([checkPlugin('http', {ok: true})])
    setNotifiers([notifierPlugin('webhook', notify)])
    store.getTarget.mockReturnValue(target())
    await runCheck(1)
    expect(notify).not.toHaveBeenCalled()
    expect(store.recordCheckResult).toHaveBeenCalledWith(
      expect.objectContaining({targetId: 1, status: 'up'}),
    )
    expect(store.markAlertSent).not.toHaveBeenCalled()
  })

  it('notifies on first failure and records last_alert_at', async () => {
    const notify = jest.fn(async (_ctx: NotifyContext) => {})
    setChecks([
      checkPlugin('http', {ok: false, statusCode: 503, error: 'HTTP 503'}),
    ])
    setNotifiers([notifierPlugin('webhook', notify)])
    store.getTarget.mockReturnValue(target())
    await runCheck(1)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0]![0]).toMatchObject({
      event: {
        status: 'down',
        previousStatus: 'unknown',
        title: 'Site down',
        body: 'https://a.test failed: [http] HTTP 503',
      },
    })
    expect(store.markAlertSent).toHaveBeenCalledWith(1)
  })

  it('runs only allowlisted checks and notifiers', async () => {
    const http = checkPlugin('http', {ok: false, error: 'http down'})
    const dns = checkPlugin('dns', {ok: false, error: 'dns down'})
    const webhook = notifierPlugin('webhook')
    const fcm = notifierPlugin('fcm')
    setChecks([http, dns])
    setNotifiers([webhook, fcm])
    store.getTarget.mockReturnValue(
      target({check_ids: ['http'], notifier_ids: ['fcm']}),
    )
    await runCheck(1)

    expect(http.check).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({url: 'https://a.test'}),
      }),
    )
    expect(dns.check).not.toHaveBeenCalled()
    expect(fcm.notify).toHaveBeenCalledTimes(1)
    expect(webhook.notify).not.toHaveBeenCalled()
  })

  it('skips checks that evaluateTarget rejects without recording them as failures', async () => {
    const http = checkPlugin('http', {ok: false, error: 'should not run'}, () => ({
      ok: false,
      reason: 'requires an http:// or https:// URL',
    }))
    const ping = checkPlugin('ping', {ok: true})
    setChecks([http, ping])
    setNotifiers([])
    store.getTarget.mockReturnValue(target({url: '8.8.8.8', check_ids: []}))
    await runCheck(1)

    expect(http.check).not.toHaveBeenCalled()
    expect(ping.check).toHaveBeenCalled()
    expect(store.recordCheckResult).toHaveBeenCalledWith(
      expect.objectContaining({targetId: 1, status: 'up'}),
    )
  })

  it('still marks the alert sent if one notifier succeeds', async () => {
    const ok = notifierPlugin(
      'webhook',
      jest.fn(async () => {}),
    )
    const boom = notifierPlugin(
      'fcm',
      jest.fn(async () => {
        throw new Error('push failed')
      }),
    )
    setChecks([checkPlugin('http', {ok: false})])
    setNotifiers([ok, boom])
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    store.getTarget.mockReturnValue(target())
    await runCheck(1)

    expect(store.markAlertSent).toHaveBeenCalledWith(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('skips notifier when per-target check allowlist does not match', async () => {
    const notify = jest.fn(async () => {})
    setChecks([checkPlugin('http', {ok: false, error: 'http down'})])
    setNotifiers([notifierPlugin('webhook', notify)])
    store.getTarget.mockReturnValue(target())
    store.getTargetNotifierConfig.mockReturnValue({
      useCustom: false,
      check_ids: ['dns'],
    })
    await runCheck(1)
    expect(notify).not.toHaveBeenCalled()
    expect(store.markAlertSent).not.toHaveBeenCalled()
  })

  it('warns when an alert is needed but no notifiers match', async () => {
    setChecks([checkPlugin('http', {ok: false})])
    setNotifiers([])
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    store.getTarget.mockReturnValue(target())
    await runCheck(1)
    expect(warn).toHaveBeenCalledWith(
      '[pipeline] alert needed but no notifiers configured',
    )
    expect(store.markAlertSent).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
