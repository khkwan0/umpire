import type {AlertEvent} from '../plugins/types.js'
import {
  applyNotifierCheckIds,
  eventMatchesNotifierCheckFilter,
  extractNotifierCheckIds,
  hasNotifierTargetOverride,
  normalizeNotifierCheckIds,
} from './notifierRouting.js'

function sampleEvent(partial: Partial<AlertEvent> = {}): AlertEvent {
  return {
    target: {id: 1, url: 'https://example.com'},
    status: 'down',
    previousStatus: 'unknown',
    error: 'fail',
    statusCode: 503,
    checkedAt: '2026-01-01T00:00:00.000Z',
    title: 'down',
    body: 'body',
    checks: [{id: 'http', ok: false, error: 'timeout', latencyMs: 1}],
    ...partial,
  }
}

describe('notifierRouting', () => {
  it('normalizes check_ids', () => {
    expect(normalizeNotifierCheckIds([' http ', 'http', 'tls'])).toEqual([
      'http',
      'tls',
    ])
    expect(normalizeNotifierCheckIds(undefined)).toEqual([])
  })

  it('extracts check_ids from stored override JSON', () => {
    expect(
      extractNotifierCheckIds({useCustom: true, check_ids: ['http']}),
    ).toEqual(['http'])
    expect(extractNotifierCheckIds(null)).toEqual([])
  })

  it('matches check filters on events', () => {
    expect(eventMatchesNotifierCheckFilter(sampleEvent(), [])).toBe(true)
    expect(
      eventMatchesNotifierCheckFilter(sampleEvent({status: 'up', checks: []}), [
        'http',
      ]),
    ).toBe(false)
    expect(eventMatchesNotifierCheckFilter(sampleEvent(), ['http'])).toBe(true)
    expect(eventMatchesNotifierCheckFilter(sampleEvent(), ['dns'])).toBe(false)
  })

  it('detects stored overrides', () => {
    expect(hasNotifierTargetOverride(null)).toBe(false)
    expect(hasNotifierTargetOverride({useCustom: false})).toBe(false)
    expect(
      hasNotifierTargetOverride({useCustom: false, check_ids: ['http']}),
    ).toBe(true)
    expect(hasNotifierTargetOverride({useCustom: true, url: 'x'})).toBe(true)
  })

  it('merges check_ids onto stored plugin config', () => {
    expect(applyNotifierCheckIds(null, ['http'])).toEqual({
      check_ids: ['http'],
    })
    expect(
      applyNotifierCheckIds({useCustom: true, url: 'x', check_ids: ['tls']}, []),
    ).toEqual({useCustom: true, url: 'x'})
    expect(applyNotifierCheckIds({useCustom: false, check_ids: ['http']}, [])).toBe(
      null,
    )
  })
})
