import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createDestination,
  importDestinations,
  listDestinations,
  parseDestinationImport,
} from './destinations.js'
import {matchingFids, normalizeConfig, normalizeTokenIds} from './config.js'

describe('fcm config', () => {
  let dir = ''

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-fcm-config-'))
    process.env.FCM_TOKENS_PATH = path.join(dir, 'fcm-tokens.json')
  })

  afterEach(() => {
    delete process.env.FCM_TOKENS_PATH
  })

  it('validates token_ids', () => {
    expect(() => normalizeTokenIds('x')).toThrow(
      'token_ids must be an array of positive integers',
    )
    expect(() => normalizeTokenIds([0])).toThrow(
      'token_ids must be an array of positive integers',
    )
  })

  it('parses destination import payloads', () => {
    expect(
      parseDestinationImport(['abc', {fid: 'def', label: 'phone'}]),
    ).toEqual([
      {fid: 'abc', label: ''},
      {fid: 'def', label: 'phone'},
    ])
    expect(parseDestinationImport({fids: ['xyz']})).toEqual([
      {fid: 'xyz', label: ''},
    ])
  })

  it('skips duplicate imports', () => {
    createDestination('existing')
    const result = importDestinations(['existing', 'new-fid', 'new-fid'])
    expect(result.created.map(r => r.fid)).toEqual(['new-fid'])
    expect(result.skipped).toEqual([
      {fid: 'existing', reason: 'already exists'},
      {fid: 'new-fid', reason: 'already exists'},
    ])
  })

  it('resolves matching fids from config', () => {
    const a = createDestination('fid-a', 'a')
    createDestination('fid-b', 'b')

    expect(matchingFids(normalizeConfig({token_ids: [a.id]}))).toEqual([
      'fid-a',
    ])
  })

  it('reads legacy token field and migrates to fid on load', () => {
    fs.writeFileSync(
      process.env.FCM_TOKENS_PATH!,
      JSON.stringify([
        {
          id: 1,
          token: 'legacy-fid',
          label: 'phone',
          enabled: 1,
          target_ids: [],
          check_ids: [],
          created_at: '2026-01-01T00:00:00.000Z',
          last_test_ok: null,
          last_test_error: null,
          last_tested_at: null,
        },
      ]),
    )
    const rows = listDestinations()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.fid).toBe('legacy-fid')
    const stored = JSON.parse(
      fs.readFileSync(process.env.FCM_TOKENS_PATH!, 'utf8'),
    ) as Array<Record<string, unknown>>
    expect(stored[0]?.fid).toBe('legacy-fid')
    expect(stored[0]?.token).toBeUndefined()
  })
})
