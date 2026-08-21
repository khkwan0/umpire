import {evaluateGate} from './permissions.js'
import type {AuthPrincipal} from '../plugins/types.js'

const admin: AuthPrincipal = {
  kind: 'user',
  user: {
    id: 1,
    username: 'admin',
    role_id: 1,
    role_slug: 'admin',
    created_at: '',
    updated_at: '',
  },
  is_admin: true,
  can_write: true,
  plugins: 'all',
  single_user_mode: false,
}

const writerCustom: AuthPrincipal = {
  kind: 'user',
  user: {
    id: 2,
    username: 'ops',
    role_id: 3,
    role_slug: 'webhook_ops',
    created_at: '',
    updated_at: '',
  },
  is_admin: false,
  can_write: true,
  plugins: [{kind: 'notify', id: 'webhook'}],
  single_user_mode: false,
}

const readOnlyUser: AuthPrincipal = {
  kind: 'user',
  user: {
    id: 3,
    username: 'viewer',
    role_id: 2,
    role_slug: 'read_only',
    created_at: '',
    updated_at: '',
  },
  is_admin: false,
  can_write: false,
  plugins: 'all',
  single_user_mode: false,
}

describe('evaluateGate', () => {
  it('allows everything when auth is disabled', () => {
    expect(
      evaluateGate({
        authEnabled: false,
        allowReadonlyWithoutAuth: false,
        method: 'DELETE',
        path: '/api/targets/1',
        principal: null,
      }),
    ).toEqual({ok: true})
  })

  it('requires auth for reads when anonymous read-only is off', () => {
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'GET',
        path: '/api/status',
        principal: null,
      }),
    ).toEqual({ok: false, status: 401, error: 'Authentication required'})
  })

  it('allows anonymous reads when configured', () => {
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: true,
        method: 'GET',
        path: '/api/status',
        principal: null,
      }),
    ).toEqual({ok: true})
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: true,
        method: 'POST',
        path: '/api/targets',
        principal: null,
      }),
    ).toEqual({ok: false, status: 401, error: 'Authentication required'})
  })

  it('blocks writes for read-only principals', () => {
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'POST',
        path: '/api/targets',
        principal: readOnlyUser,
      }),
    ).toEqual({ok: false, status: 403, error: 'Write access required'})
  })

  it('restricts admin-only paths', () => {
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'GET',
        path: '/api/users',
        principal: writerCustom,
      }),
    ).toEqual({ok: false, status: 403, error: 'Admin access required'})
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'PUT',
        path: '/api/settings',
        principal: writerCustom,
      }),
    ).toEqual({ok: false, status: 403, error: 'Admin access required'})
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'GET',
        path: '/api/users',
        principal: admin,
      }),
    ).toEqual({ok: true})
  })

  it('enforces custom role plugin allowlists', () => {
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'GET',
        path: '/api/plugins/notify/webhook/config',
        principal: writerCustom,
      }),
    ).toEqual({ok: true})
    expect(
      evaluateGate({
        authEnabled: true,
        allowReadonlyWithoutAuth: false,
        method: 'GET',
        path: '/api/plugins/notify/slack/config',
        principal: writerCustom,
      }),
    ).toEqual({ok: false, status: 403, error: 'Plugin access denied'})
  })
})
