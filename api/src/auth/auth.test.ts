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

  it('seeds system roles including read_write', () => {
    const roles = core.listRoles()
    expect(roles.map(r => r.slug).sort()).toEqual([
      'admin',
      'read_only',
      'read_write',
    ])
    expect(roles.every(r => r.is_system && r.plugins === 'all')).toBe(true)
  })

  it('bootstraps an admin user and enforces role permissions', () => {
    const adminUser = core.bootstrapAdmin('root', 'password1')
    expect(adminUser.role_slug).toBe('admin')

    const adminPrincipal = core.principalForUser(adminUser.id)!
    expect(adminPrincipal.is_admin).toBe(true)
    expect(adminPrincipal.can_write).toBe(true)

    const readWrite = core.getRoleBySlug('read_write')!
    const writer = core.createUser({
      username: 'writer',
      password: 'password1',
      role_id: readWrite.id,
    })
    const writerPrincipal = core.principalForUser(writer.id)!
    expect(writerPrincipal.is_admin).toBe(false)
    expect(writerPrincipal.can_write).toBe(true)

    const readOnly = core.getRoleBySlug('read_only')!
    const viewer = core.createUser({
      username: 'viewer',
      password: 'password1',
      role_id: readOnly.id,
    })
    const viewerPrincipal = core.principalForUser(viewer.id)!
    expect(viewerPrincipal.is_admin).toBe(false)
    expect(viewerPrincipal.can_write).toBe(false)
  })

  it('rejects mutating system roles and empty custom plugin allowlists', () => {
    core.bootstrapAdmin('root', 'password1')
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

  it('resolves session principals', () => {
    const admin = core.getRoleBySlug('admin')!
    const user = core.createUser({
      username: 'admin',
      password: 'password1',
      role_id: admin.id,
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

  it('blocks deleting the last user', () => {
    const user = core.bootstrapAdmin('only', 'password1')
    expect(() => core.deleteUser(user.id)).toThrow(/last user/)
  })

  it('invalidates sessions when password changes', () => {
    const user = core.bootstrapAdmin('solo', 'password1')
    const token = newSessionToken()
    const expires = new Date(Date.now() + 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    core.createSession(user.id, hashSessionToken(token), expires)
    expect(core.resolveSessionPrincipal(token)).not.toBeNull()

    core.updateUser(user.id, {password: 'new-password1'})
    expect(core.resolveSessionPrincipal(token)).toBeNull()
  })
})
