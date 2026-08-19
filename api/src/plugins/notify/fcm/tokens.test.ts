import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AlertEvent, FcmToken } from '../../types.js'
import {
  createToken,
  importTokens,
  normalizeCheckIds,
  normalizeTargetIds,
  parseTokenImport,
  tokenMatchesAlert,
} from './tokens.js'

function sampleEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    target: { id: 1, url: 'https://a.test' },
    status: 'down',
    previousStatus: 'up',
    error: 'failed',
    statusCode: 500,
    checkedAt: '2026-01-01T00:00:00.000Z',
    title: 'Site down',
    body: 'down',
    checks: [
      {
        id: 'http',
        ok: false,
        statusCode: 500,
        error: 'HTTP 500',
        latencyMs: 1,
      },
    ],
    ...overrides,
  }
}

function token(partial: Partial<FcmToken> = {}): FcmToken {
  return {
    id: 1,
    token: 'fid-1',
    label: '',
    enabled: 1,
    target_ids: [],
    check_ids: [],
    created_at: '2026-01-01T00:00:00.000Z',
    last_test_ok: null,
    last_test_error: null,
    last_tested_at: null,
    ...partial,
  }
}

describe('normalizeTargetIds / normalizeCheckIds', () => {
  it('dedupes and rejects invalid values', () => {
    expect(normalizeTargetIds(undefined)).toEqual([])
    expect(normalizeTargetIds([1, '2', 1])).toEqual([1, 2])
    expect(() => normalizeTargetIds(1)).toThrow(
      'target_ids must be an array of positive integers',
    )
    expect(() => normalizeTargetIds([0])).toThrow(
      'target_ids must be an array of positive integers',
    )

    expect(normalizeCheckIds([' http ', 'http', 'dns'])).toEqual([
      'http',
      'dns',
    ])
    expect(() => normalizeCheckIds([''])).toThrow(
      'check_ids must be an array of non-empty strings',
    )
  })
})

describe('parseTokenImport', () => {
  it('accepts FID strings and { fids } wrappers', () => {
    expect(parseTokenImport(['abc', { fid: 'def', label: 'phone' }])).toEqual([
      { token: 'abc', label: '', target_ids: [], check_ids: [] },
      { token: 'def', label: 'phone', target_ids: [], check_ids: [] },
    ])
    expect(parseTokenImport({ fids: ['xyz'] })).toEqual([
      { token: 'xyz', label: '', target_ids: [], check_ids: [] },
    ])
  })

  it('rejects empty or invalid payloads', () => {
    expect(() => parseTokenImport([])).toThrow('import array is empty')
    expect(() => parseTokenImport({ tokens: [1] })).toThrow(
      'item 0: must be a string or object',
    )
    expect(() => parseTokenImport({ nope: [] })).toThrow(/import must be/)
  })
})

describe('tokenMatchesAlert', () => {
  it('skips disabled tokens', () => {
    expect(tokenMatchesAlert(token({ enabled: 0 }), sampleEvent())).toBe(false)
  })

  it('filters by target allowlist', () => {
    expect(tokenMatchesAlert(token({ target_ids: [2] }), sampleEvent())).toBe(
      false,
    )
    expect(tokenMatchesAlert(token({ target_ids: [1] }), sampleEvent())).toBe(
      true,
    )
  })

  it('with a check allowlist, skips recoveries and unmatched failures', () => {
    const row = token({ check_ids: ['http'] })
    expect(
      tokenMatchesAlert(row, sampleEvent({ status: 'up', checks: [] })),
    ).toBe(false)
    expect(
      tokenMatchesAlert(
        row,
        sampleEvent({
          checks: [
            {
              id: 'dns',
              ok: false,
              statusCode: null,
              error: 'x',
              latencyMs: 1,
            },
          ],
        }),
      ),
    ).toBe(false)
    expect(tokenMatchesAlert(row, sampleEvent())).toBe(true)
  })

  it('matches all alerts when check_ids is empty', () => {
    expect(
      tokenMatchesAlert(token(), sampleEvent({ status: 'up', checks: [] })),
    ).toBe(true)
  })
})

describe('importTokens', () => {
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-fcm-'))
    process.env.FCM_TOKENS_PATH = path.join(dir, 'fcm-tokens.json')
  })

  afterEach(() => {
    delete process.env.FCM_TOKENS_PATH
  })

  it('creates new FIDs and skips duplicates', () => {
    createToken('existing')
    const result = importTokens(['existing', 'new-fid', 'new-fid'])
    expect(result.created.map((r) => r.token)).toEqual(['new-fid'])
    expect(result.skipped).toEqual([
      { token: 'existing', reason: 'already exists' },
      { token: 'new-fid', reason: 'already exists' },
    ])
  })
})
