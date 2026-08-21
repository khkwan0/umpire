import {jest} from '@jest/globals'
import type {CheckPlugin} from './plugins/types.js'
import {setChecks} from './plugins/runtime.js'

const {evaluateChecksForTarget, firstIncompatibleAllowlistId} = await import(
  './checkCompatibility.js'
)
const {evaluateHttpTarget} = await import('../../plugins/check/http/index.js')

describe('evaluateHttpTarget', () => {
  it('requires an http(s) scheme', () => {
    expect(
      evaluateHttpTarget({
        url: 'https://example.com',
        interval_seconds: 60,
        group_id: null,
      }),
    ).toEqual({ok: true})
    expect(
      evaluateHttpTarget({
        url: '8.8.8.8',
        interval_seconds: 60,
        group_id: null,
      }),
    ).toEqual({
      ok: false,
      reason: 'requires an http:// or https:// URL',
    })
  })
})

describe('evaluateChecksForTarget', () => {
  it('aggregates plugin evaluateTarget results', () => {
    const http: CheckPlugin = {
      id: 'http',
      evaluateTarget: evaluateHttpTarget,
      check: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        error: null,
        latencyMs: 1,
      })),
    }
    const ping: CheckPlugin = {
      id: 'ping',
      check: jest.fn(async () => ({
        ok: true,
        statusCode: null,
        error: null,
        latencyMs: 1,
      })),
    }
    setChecks([http, ping])
    expect(
      evaluateChecksForTarget({
        url: '8.8.8.8',
        interval_seconds: 60,
        group_id: null,
      }),
    ).toEqual([
      {
        id: 'http',
        compatible: false,
        reason: 'requires an http:// or https:// URL',
      },
      {id: 'ping', compatible: true, reason: null},
    ])
    expect(
      firstIncompatibleAllowlistId(
        {url: '8.8.8.8', interval_seconds: 60, group_id: null},
        ['http'],
      ),
    ).toMatchObject({id: 'http', compatible: false})
    expect(
      firstIncompatibleAllowlistId(
        {url: '8.8.8.8', interval_seconds: 60, group_id: null},
        [],
      ),
    ).toBeNull()
  })
})
