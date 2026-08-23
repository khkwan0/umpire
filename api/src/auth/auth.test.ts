import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {core, initCore, closeCore} from '../core/sqlite.js'
import {hashPassword, verifyPassword} from './password.js'
import {hashSessionToken, newSessionToken} from './cookies.js'
import {apiTokenPrefix, hashApiToken, newApiToken} from './tokens.js'

function sqliteBindingsAvailable(): boolean {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-auth-probe-'))
    initCore(path.join(dir, 'monitor.sqlite'))
    closeCore()
    return true
  } catch {
    return false
  }
}

const describeAuth = sqliteBindingsAvailable() ? describe : describe.skip

describe('password helpers', () => {
  it('hashes and verifies passwords', () => {
    const hash = hashPassword('secret-pass')
    expect(verifyPassword('secret-pass', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })
})

describeAuth('auth store and RBAC', () => {
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umpire-auth-'))
    initCore(path.join(dir, 'monitor.sqlite'))
  })

  afterEach(() => {
    closeCore()
  })

  it('seeds system roles and blocks enabling auth with zero users', () => {
    const roles = core.listRoles()
    expect(roles.map(r => r.slug).sort()).toEqual(['admin', 'read_only'])
    expect(roles.every(r => r.is_system && r.plugins === 'all')).toBe(true)
    expect(() => core.updateSettings({auth_enabled: true})).toThrow(
      /at least one user/,
    )
  })

  it('creates users, enables auth, and elevates single-user to admin', () => {
    const admin = core.getRoleBySlug('admin')!
    const readOnly = core.getRoleBySlug('read_only')!
    const user = core.createUser({
      username: 'solo',
      password: 'password1',
      role_id: readOnly.id,
    })
    expect(user.role_slug).toBe('read_only')
    expect(core.updateSettings({auth_enabled: true}).auth_enabled).toBe(true)

    const principal = core.principalForUser(user.id)!
    expect(principal.single_user_mode).toBe(true)
    expect(principal.is_admin).toBe(true)
    expect(principal.can_write).toBe(true)

    core.createUser({
      username: 'second',
      password: 'password1',
      role_id: admin.id,
    })
    const after = core.principalForUser(user.id)!
    expect(after.single_user_mode).toBe(false)
    expect(after.is_admin).toBe(false)
    expect(after.can_write).toBe(false)
  })

  it('rejects mutating system roles and empty custom plugin allowlists', () => {
    const admin = core.getRoleBySlug('admin')!
    expect(() => core.updateRole(admin.id, {name: 'Nope'})).toThrow(
      /cannot be modified/,
    )
    expect(() => core.deleteRole(admin.id)).toThrow(/cannot be deleted/)

    const custom = core.createRole({
      name: 'Webhook only',
      can_write: true,
      plugins: [{kind: 'notify', id: 'webhook'}],
    })
    expect(custom.plugins).toEqual([{kind: 'notify', id: 'webhook'}])
    expect(custom.is_system).toBe(false)
  })

  it('resolves session principals and anonymous read-only', () => {
    const admin = core.getRoleBySlug('admin')!
    const user = core.createUser({
      username: 'admin',
      password: 'password1',
      role_id: admin.id,
    })
    core.updateSettings({
      auth_enabled: true,
      allow_readonly_without_auth: true,
    })

    const token = newSessionToken()
    const expires = new Date(Date.now() + 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    core.createSession(user.id, hashSessionToken(token), expires)

    const sessionPrincipal = core.resolveSessionPrincipal(token)!
    expect(sessionPrincipal.user?.id).toBe(user.id)
    expect(sessionPrincipal.is_admin).toBe(true)

    const anon = core.anonymousReadOnlyPrincipal()
    expect(anon.kind).toBe('anonymous')
    expect(anon.can_write).toBe(false)
    expect(anon.plugins).toBe('all')

    expect(core.resolveSessionPrincipal('bogus')).toBeNull()
  })

  it('creates, resolves, and revokes API tokens', () => {
    const admin = core.getRoleBySlug('admin')!
    const readOnly = core.getRoleBySlug('read_only')!
    core.createUser({
      username: 'admin2',
      password: 'password1',
      role_id: admin.id,
    })
    const user = core.createUser({
      username: 'agent',
      password: 'password1',
      role_id: readOnly.id,
    })
    core.updateSettings({auth_enabled: true})

    const raw = newApiToken()
    const created = core.createApiToken({
      userId: user.id,
      label: 'MCP agent',
      tokenHash: hashApiToken(raw),
      tokenPrefix: apiTokenPrefix(raw),
      expiresAt: null,
    })
    expect(created.token_prefix.startsWith('umpire_')).toBe(true)

    const principal = core.resolveApiTokenPrincipal(raw)!
    expect(principal.user?.id).toBe(user.id)
    expect(principal.can_write).toBe(false)
    expect(principal.is_admin).toBe(false)

    expect(core.listApiTokens(user.id)).toHaveLength(1)
    expect(core.deleteApiToken(created.id)).toBe(true)
    expect(core.resolveApiTokenPrincipal(raw)).toBeNull()
  })

  it('blocks deleting the last user while auth is enabled', () => {
    const admin = core.getRoleBySlug('admin')!
    const user = core.createUser({
      username: 'only',
      password: 'password1',
      role_id: admin.id,
    })
    core.updateSettings({auth_enabled: true})
    expect(() => core.deleteUser(user.id)).toThrow(/last user/)
    core.updateSettings({auth_enabled: false})
    expect(core.deleteUser(user.id)).toBe(true)
  })
})
