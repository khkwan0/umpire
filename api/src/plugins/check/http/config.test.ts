import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildTargetConfigView,
  defaultHttpCheckConfig,
  mergeHttpCheckConfig,
  normalizeConfig,
  parseStoredOverride,
  readDefaults,
  resolveHttpCheckConfigForTarget,
  writeDefaults,
} from './config.js'

describe('http check config', () => {
  let dir = ''

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-http-config-'))
    process.env.DATABASE_PATH = path.join(dir, 'monitor.sqlite')
  })

  afterEach(() => {
    delete process.env.DATABASE_PATH
  })

  it('reads and writes defaults from sidecar file', () => {
    expect(readDefaults()).toMatchObject(defaultHttpCheckConfig)
    const saved = writeDefaults({
      method: 'POST',
      headers: { 'x-test': '1' },
      body: '{"a":1}',
      acceptedStatusRanges: ['2xx', '3xx'],
      maxLatencyMs: 900,
    })
    expect(saved.method).toBe('POST')
    expect(readDefaults()).toEqual(saved)
  })

  it('uses defaults when no target override exists', () => {
    writeDefaults({
      method: 'HEAD',
      headers: {},
      body: '',
      acceptedStatusRanges: ['2xx'],
      maxLatencyMs: null,
    })
    const effective = resolveHttpCheckConfigForTarget(null)
    expect(effective.method).toBe('HEAD')
  })

  it('merges legacy full target config as custom override', () => {
    writeDefaults({
      method: 'GET',
      headers: {},
      body: '',
      acceptedStatusRanges: ['2xx'],
      maxLatencyMs: null,
    })
    const legacy = normalizeConfig({
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
      body: '{}',
      acceptedStatusRanges: ['2xx'],
      maxLatencyMs: 500,
    })
    const effective = resolveHttpCheckConfigForTarget(legacy)
    expect(effective.method).toBe('POST')
    expect(effective.headers).toEqual({ Authorization: 'Bearer x' })
  })

  it('builds target view with defaults-only target', () => {
    writeDefaults({
      method: 'GET',
      headers: { accept: 'application/json' },
      body: '',
      acceptedStatusRanges: ['2xx'],
      maxLatencyMs: null,
    })
    const view = buildTargetConfigView(null)
    expect(view.useCustom).toBe(false)
    expect(view.override).toBeNull()
    expect(view.effective.headers).toEqual({ accept: 'application/json' })
  })

  it('builds target view with custom override', () => {
    const defaults = writeDefaults({
      method: 'GET',
      headers: {},
      body: '',
      acceptedStatusRanges: ['2xx'],
      maxLatencyMs: null,
    })
    const stored = {
      useCustom: true,
      method: 'PUT',
      headers: { 'x-target': '1' },
      body: 'ping',
      acceptedStatusRanges: ['2xx', '3xx'],
      maxLatencyMs: 100,
    }
    const view = buildTargetConfigView(stored)
    expect(view.useCustom).toBe(true)
    expect(view.defaults).toEqual(defaults)
    expect(view.effective.method).toBe('PUT')
    expect(parseStoredOverride(stored)?.useCustom).toBe(true)
    expect(
      mergeHttpCheckConfig(defaults, parseStoredOverride(stored)).method,
    ).toBe('PUT')
  })

  it('requires at least one range or specific code', () => {
    expect(() =>
      normalizeConfig({
        method: 'GET',
        headers: {},
        body: '',
        acceptedStatusRanges: [],
        acceptedStatusCodes: [],
        maxLatencyMs: null,
      }),
    ).toThrow(/At least one accepted status range or specific status code/)
  })

  it('accepts specific status codes only', () => {
    const config = normalizeConfig({
      method: 'GET',
      headers: {},
      body: '',
      acceptedStatusRanges: [],
      acceptedStatusCodes: [200, 204],
      maxLatencyMs: null,
    })
    expect(config.acceptedStatusCodes).toEqual([200, 204])
    expect(config.acceptedStatusRanges).toEqual([])
  })
})
