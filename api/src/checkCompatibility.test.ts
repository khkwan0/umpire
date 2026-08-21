import {jest} from '@jest/globals'
import type {CheckPlugin} from './plugins/types.js'
import {setChecks} from './plugins/runtime.js'

const {evaluateChecksForTarget, firstIncompatibleAllowlistId} =
  await import('./checkCompatibility.js')

describe('evaluateChecksForTarget', () => {
  it('aggregates plugin evaluateTarget results without knowing plugin ids', () => {
    const needsScheme: CheckPlugin = {
      id: 'needs-scheme',
      evaluateTarget: ({url}) =>
        url.includes('://')
          ? {ok: true}
          : {ok: false, reason: 'requires an http:// or https:// URL'},
      check: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        error: null,
        latencyMs: 1,
      })),
    }
    const alwaysOk: CheckPlugin = {
      id: 'always-ok',
      check: jest.fn(async () => ({
        ok: true,
        statusCode: null,
        error: null,
        latencyMs: 1,
      })),
    }
    setChecks([needsScheme, alwaysOk])
    expect(
      evaluateChecksForTarget({
        url: '8.8.8.8',
        interval_seconds: 60,
        group_id: null,
      }),
    ).toEqual([
      {
        id: 'needs-scheme',
        compatible: false,
        reason: 'requires an http:// or https:// URL',
      },
      {id: 'always-ok', compatible: true, reason: null},
    ])
    expect(
      firstIncompatibleAllowlistId(
        {url: '8.8.8.8', interval_seconds: 60, group_id: null},
        ['needs-scheme'],
      ),
    ).toMatchObject({id: 'needs-scheme', compatible: false})
    expect(
      firstIncompatibleAllowlistId(
        {url: '8.8.8.8', interval_seconds: 60, group_id: null},
        [],
      ),
    ).toBeNull()
  })
})
