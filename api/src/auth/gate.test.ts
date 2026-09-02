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
}

describe('evaluateGate', () => {
  it('allows anonymous read-only GET when configured', () => {
    expect(
      evaluateGate({
        method: 'GET',
        path: '/api/status',
        principal: null,
        allowReadonlyWithoutAuth: true,
      }),
    ).toEqual({ok: true})
    expect(
      evaluateGate({
        method: 'POST',
        path: '/api/targets',
        principal: null,
        allowReadonlyWithoutAuth: true,
      }),
    ).toEqual({ok: false, status: 401, error: 'Authentication required'})
  })

  it('requires auth for reads when readonly mode is off', () => {
    expect(
      evaluateGate({
        method: 'GET',
        path: '/api/status',
        principal: null,
      }),
    ).toEqual({ok: false, status: 401, error: 'Authentication required'})
  })

  it('blocks writes for read-only principals', () => {
    expect(
      evaluateGate({
        method: 'POST',
        path: '/api/targets',
        principal: readOnlyUser,
      }),
    ).toEqual({ok: false, status: 403, error: 'Write access required'})
  })

  it('allows read-only users to change their password', () => {
    expect(
      evaluateGate({
        method: 'POST',
        path: '/api/auth/change-password',
        principal: readOnlyUser,
      }),
    ).toEqual({ok: true})
  })

  it('restricts admin-only paths', () => {
    expect(
      evaluateGate({
        method: 'GET',
        path: '/api/users',
        principal: writerCustom,
      }),
    ).toEqual({ok: false, status: 403, error: 'Admin access required'})
    expect(
      evaluateGate({
        method: 'PUT',
        path: '/api/settings',
        principal: writerCustom,
      }),
    ).toEqual({ok: false, status: 403, error: 'Admin access required'})
    expect(
      evaluateGate({
        method: 'GET',
        path: '/api/users',
        principal: admin,
      }),
    ).toEqual({ok: true})
  })

  it('allows anonymous FCM device registration', () => {
    expect(
      evaluateGate({
        method: 'POST',
        path: '/api/plugins/notify/fcm/tokens/register',
        principal: null,
      }),
    ).toEqual({ok: true})
  })

  it('allows read-only users to register FCM device tokens', () => {
    expect(
      evaluateGate({
        method: 'POST',
        path: '/api/plugins/notify/fcm/tokens/register',
        principal: readOnlyUser,
      }),
    ).toEqual({ok: true})
  })

  it('still blocks read-only users from admin FCM token management', () => {
    expect(
      evaluateGate({
        method: 'POST',
        path: '/api/plugins/notify/fcm/tokens',
        principal: readOnlyUser,
      }),
    ).toEqual({ok: false, status: 403, error: 'Write access required'})
  })

  it('enforces custom role plugin allowlists', () => {
    expect(
      evaluateGate({
        method: 'GET',
        path: '/api/plugins/notify/webhook/config',
        principal: writerCustom,
      }),
    ).toEqual({ok: true})
    expect(
      evaluateGate({
        method: 'GET',
        path: '/api/plugins/notify/slack/config',
        principal: writerCustom,
      }),
    ).toEqual({ok: false, status: 403, error: 'Plugin access denied'})
  })
})
