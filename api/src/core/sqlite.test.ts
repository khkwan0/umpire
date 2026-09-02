import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {core, initCore, normalizePluginIds} from './sqlite.js'

function sqliteBindingsAvailable(): boolean {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-sqlite-probe-'))
    initCore(path.join(dir, 'monitor.sqlite'))
    return true
  } catch {
    return false
  }
}

describe('normalizePluginIds', () => {
  it('treats missing values as an empty allowlist', () => {
    expect(normalizePluginIds(undefined, 'check_ids')).toEqual([])
    expect(normalizePluginIds(null, 'check_ids')).toEqual([])
  })

  it('trims, skips duplicates, and rejects invalid entries', () => {
    expect(normalizePluginIds([' http ', 'dns', 'http'], 'check_ids')).toEqual([
      'http',
      'dns',
    ])
    expect(() => normalizePluginIds('http', 'check_ids')).toThrow(
      'check_ids must be an array of strings',
    )
    expect(() => normalizePluginIds([''], 'notifier_ids')).toThrow(
      'notifier_ids must be an array of non-empty strings',
    )
  })
})

const describeStore = sqliteBindingsAvailable() ? describe : describe.skip

describeStore('core sqlite store', () => {
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-sqlite-'))
    initCore(path.join(dir, 'monitor.sqlite'))
  })

  it('defaults settings and validates updates', () => {
    expect(core.getSettings()).toEqual({
      alert_policy: 'state_change',
      throttle_minutes: 30,
    })
    expect(
      core.updateSettings({alert_policy: 'throttle', throttle_minutes: 5}),
    ).toEqual({
      alert_policy: 'throttle',
      throttle_minutes: 5,
    })
    expect(() =>
      core.updateSettings({alert_policy: 'nope' as 'state_change'}),
    ).toThrow('Invalid alert_policy')
    expect(() => core.updateSettings({throttle_minutes: 0})).toThrow(
      'throttle_minutes must be >= 1',
    )
  })

  it('bootstraps admin on a fresh install', () => {
    const user = core.bootstrapAdmin('admin', 'password1')
    expect(user.username).toBe('admin')
    expect(user.role_slug).toBe('admin')
    expect(core.countUsers()).toBe(1)
    expect(core.getAllowReadonlyWithoutAuth()).toBe(false)
    core.setAllowReadonlyWithoutAuth(true)
    expect(core.getAllowReadonlyWithoutAuth()).toBe(true)
  })

  it('assigns group tags by path and builds a tree', () => {
    const root = core.createGroup({name: 'prod'})
    const child = core.createGroup({parent: root.id, name: 'api'})
    const leaf = core.createGroup({parent: child.id, name: 'west'})

    expect(root.tag).toBe(`group_${root.id}`)
    expect(child.tag).toBe(`group_group_${root.id}_group_${child.id}`)
    expect(leaf.tag).toBe(
      `group_group_${root.id}_group_${child.id}_group_${leaf.id}`,
    )

    const tree = core.listGroupTree()
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children[0]!.id).toBe(child.id)
    expect(tree[0]!.children[0]!.children[0]!.id).toBe(leaf.id)
  })

  it('rejects moving a group under itself', () => {
    const root = core.createGroup({name: 'root'})
    const child = core.createGroup({parent: root.id, name: 'child'})
    expect(() => core.updateGroup(root.id, {parent: child.id})).toThrow(
      'cannot move group under itself or a descendant',
    )
  })

  it('deletes a subtree', () => {
    const root = core.createGroup({name: 'root'})
    const child = core.createGroup({parent: root.id, name: 'child'})
    expect(core.deleteGroup(root.id)).toBe(true)
    expect(core.getGroup(root.id)).toBeUndefined()
    expect(core.getGroup(child.id)).toBeUndefined()
  })

  it('requires targets to attach to a child group', () => {
    const root = core.createGroup({name: 'root'})
    const child = core.createGroup({parent: root.id, name: 'child'})
    expect(() =>
      core.createTarget('https://a.test', 60, true, root.id),
    ).toThrow('targets must belong to a child group (not a root)')

    const created = core.createTarget(
      'https://a.test',
      30,
      true,
      child.id,
      ['http'],
      ['fcm'],
    )
    expect(created.group_id).toBe(child.id)
    expect(created.check_ids).toEqual(['http'])
    expect(created.notifier_ids).toEqual(['fcm'])
    expect(core.getTargetState(created.id)).toMatchObject({
      target_id: created.id,
      is_up: null,
    })
  })

  it('records check results and keeps target state in sync', () => {
    const created = core.createTarget('https://a.test', 60)
    core.recordCheckResult({
      targetId: created.id,
      status: 'down',
      statusCode: 500,
      error: 'HTTP 500',
      latencyMs: 12,
    })
    core.markAlertSent(created.id)

    const state = core.getTargetState(created.id)
    expect(state?.is_up).toBe(0)
    expect(state?.last_status_code).toBe(500)
    expect(state?.last_error).toBe('HTTP 500')
    expect(state?.last_alert_at).toBeTruthy()

    const results = core.listRecentResults(created.id)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      target_id: created.id,
      ok: 0,
      status_code: 500,
    })
  })

  it('builds an outage and recovery log from check results', () => {
    const a = core.createTarget('https://a.test', 60)
    const b = core.createTarget('https://b.test', 60)

    core.recordCheckResult({
      targetId: a.id,
      status: 'down',
      statusCode: 500,
      error: 'HTTP 500',
      latencyMs: 10,
    })
    core.recordCheckResult({
      targetId: a.id,
      status: 'up',
      statusCode: 200,
      error: null,
      latencyMs: 8,
    })
    core.recordCheckResult({
      targetId: b.id,
      status: 'partial',
      statusCode: 500,
      error: '[http] 500',
      latencyMs: 20,
    })

    const incidents = core.listIncidents()
    expect(incidents).toHaveLength(2)
    expect(incidents.map(i => i.target_id)).toEqual([b.id, a.id])
    expect(incidents[0]).toMatchObject({
      target_id: b.id,
      url: 'https://b.test',
      status: 'partial',
      recovered: false,
      error: '[http] 500',
    })
    expect(incidents[1]).toMatchObject({
      target_id: a.id,
      url: 'https://a.test',
      status: 'down',
      recovered: true,
      error: 'HTTP 500',
      status_code: 500,
    })
    expect(incidents[1]?.recovered_at).toBeTruthy()
    expect(core.listIncidents(1)).toHaveLength(1)
  })

  it('updates and deletes targets', () => {
    const created = core.createTarget('https://a.test', 60)
    const updated = core.updateTarget(created.id, {
      url: 'https://b.test',
      enabled: false,
      interval_seconds: 15,
    })
    expect(updated).toMatchObject({
      url: 'https://b.test',
      enabled: 0,
      interval_seconds: 15,
    })
    expect(core.deleteTarget(created.id)).toBe(true)
    expect(core.getTarget(created.id)).toBeUndefined()
    expect(core.deleteTarget(created.id)).toBe(false)
  })
})
