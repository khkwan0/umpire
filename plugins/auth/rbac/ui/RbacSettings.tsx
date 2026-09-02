import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {
  api,
  type Role,
  type RolePluginRef,
  type User,
} from '@umpire/web-api'
import type {AuthPluginSettingsProps} from '@umpire/plugin-ui'
import {useAuth} from '@umpire/web-auth'
import ApiTokensPanel from './ApiTokensPanel'

function pluginKey(p: RolePluginRef): string {
  return `${p.kind}:${p.id}`
}

export default function RbacSettings({pluginManager}: AuthPluginSettingsProps) {
  const {principal, policy, refresh: refreshAuth, logout} = useAuth()
  const isAdmin = Boolean(principal?.is_admin)
  const signedIn = principal?.kind === 'user'

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [allowReadonlyWithoutAuth, setAllowReadonlyWithoutAuth] = useState(false)
  const [authConfigBusy, setAuthConfigBusy] = useState(false)
  const [ownCurrentPassword, setOwnCurrentPassword] = useState('')
  const [ownNewPassword, setOwnNewPassword] = useState('')
  const [changePasswordBusy, setChangePasswordBusy] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newUserRoleId, setNewUserRoleId] = useState<number | ''>('')
  const [editUserId, setEditUserId] = useState<number | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editUserRoleId, setEditUserRoleId] = useState<number | ''>('')

  const [roleName, setRoleName] = useState('')
  const [roleCanWrite, setRoleCanWrite] = useState(false)
  const [rolePlugins, setRolePlugins] = useState<RolePluginRef[]>([])
  const [editRoleId, setEditRoleId] = useState<number | null>(null)

  const availablePlugins = useMemo(() => {
    if (!pluginManager) return [] as RolePluginRef[]
    return [
      {kind: 'scheduler' as const, id: pluginManager.scheduler.id},
      ...pluginManager.checks.map(c => ({kind: 'check' as const, id: c.id})),
      ...pluginManager.notifiers.map(n => ({kind: 'notify' as const, id: n.id})),
    ]
  }, [pluginManager])

  const loadAdminLists = useCallback(async () => {
    if (!isAdmin) {
      setUsers([])
      setRoles([])
      return
    }
    const [u, r] = await Promise.all([api.users.list(), api.roles.list()])
    setUsers(u)
    setRoles(r)
    if (newUserRoleId === '' && r.length > 0) {
      const admin = r.find(role => role.slug === 'admin')
      setNewUserRoleId(admin?.id ?? r[0]!.id)
    }
  }, [isAdmin, newUserRoleId])

  useEffect(() => {
    if (policy?.auth_enabled) {
      setAllowReadonlyWithoutAuth(policy.allow_readonly_without_auth)
    }
  }, [policy])

  useEffect(() => {
    if (isAdmin && policy?.auth_enabled) {
      void loadAdminLists()
    } else {
      setUsers([])
      setRoles([])
    }
  }, [isAdmin, policy?.auth_enabled, loadAdminLists])

  async function onSaveAuthConfig() {
    if (!isAdmin) return
    setAuthConfigBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.auth.rbacConfig.put(allowReadonlyWithoutAuth)
      setMessage('Authentication settings saved')
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAuthConfigBusy(false)
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    setChangePasswordBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.auth.changePassword(ownCurrentPassword, ownNewPassword)
      setOwnCurrentPassword('')
      setOwnNewPassword('')
      setMessage('Password changed')
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChangePasswordBusy(false)
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault()
    if (newUserRoleId === '') return
    setError(null)
    setMessage(null)
    try {
      await api.users.create({
        username: newUsername,
        password: newPassword,
        role_id: newUserRoleId,
      })
      setNewUsername('')
      setNewPassword('')
      setMessage('User created')
      await loadAdminLists()
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault()
    if (editUserId == null || editUserRoleId === '') return
    setError(null)
    setMessage(null)
    try {
      const patch: Partial<{
        username: string
        password: string
        role_id: number
      }> = {
        username: editUsername,
        role_id: editUserRoleId,
      }
      if (editPassword) patch.password = editPassword
      await api.users.update(editUserId, patch)
      setEditUserId(null)
      setEditPassword('')
      setMessage('User updated')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeUser(id: number) {
    setError(null)
    setMessage(null)
    try {
      await api.users.remove(id)
      setMessage('User deleted')
      await loadAdminLists()
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleRolePlugin(ref: RolePluginRef) {
    setRolePlugins(prev => {
      const key = pluginKey(ref)
      if (prev.some(p => pluginKey(p) === key)) {
        return prev.filter(p => pluginKey(p) !== key)
      }
      return [...prev, ref]
    })
  }

  async function createRole(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await api.roles.create({
        name: roleName,
        can_write: roleCanWrite,
        plugins: rolePlugins,
      })
      setRoleName('')
      setRoleCanWrite(false)
      setRolePlugins([])
      setMessage('Role created')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault()
    if (editRoleId == null) return
    setError(null)
    setMessage(null)
    try {
      await api.roles.update(editRoleId, {
        name: roleName,
        can_write: roleCanWrite,
        plugins: rolePlugins,
      })
      setEditRoleId(null)
      setRoleName('')
      setRoleCanWrite(false)
      setRolePlugins([])
      setMessage('Role updated')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeRole(id: number) {
    setError(null)
    setMessage(null)
    try {
      await api.roles.remove(id)
      setMessage('Role deleted')
      await loadAdminLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function startEditRole(role: Role) {
    setEditRoleId(role.id)
    setRoleName(role.name)
    setRoleCanWrite(role.can_write)
    setRolePlugins(role.plugins === 'all' ? [] : [...role.plugins])
  }

  function cancelEditRole() {
    setEditRoleId(null)
    setRoleName('')
    setRoleCanWrite(false)
    setRolePlugins([])
  }

  return (
    <>
      {message && <p className="ok-text">{message}</p>}
      {error && <p className="error">{error}</p>}

      <section className="panel">
        <h2>Account</h2>
        {signedIn ? (
          <>
            <p className="muted small">
              Signed in as <strong>{principal?.user?.username}</strong>
              {principal?.is_admin ? ' (admin)' : ''}.
            </p>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="muted small">
              Sign in for write access. You can also authenticate without the
              UI: <code>POST /api/auth/login</code> sets a session cookie;
              create a Bearer token with <code>POST /api/tokens</code> after
              logging in. See <code>docs/api.md</code>.
            </p>
            <Link to="/login">Sign in</Link>
          </>
        )}
      </section>

      {isAdmin && (
        <section className="panel">
          <h2>Authentication</h2>
          <p className="muted small">
            Control whether visitors can browse the dashboard without signing
            in. Write access always requires a signed-in account.
          </p>
          <div className="form-col">
            <label className="check-ids-item">
              <input
                type="checkbox"
                checked={allowReadonlyWithoutAuth}
                onChange={e => setAllowReadonlyWithoutAuth(e.target.checked)}
              />
              Allow read-only access without signing in
            </label>
            <button
              type="button"
              onClick={() => void onSaveAuthConfig()}
              disabled={authConfigBusy}
            >
              {authConfigBusy ? 'Saving…' : 'Save authentication settings'}
            </button>
          </div>
        </section>
      )}

      {signedIn && (
        <section className="panel">
          <h2>Change password</h2>
          <p className="muted small">
            Update the password for your account ({principal?.user?.username}).
          </p>
          <form className="form-col" onSubmit={onChangePassword}>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={ownCurrentPassword}
                onChange={e => setOwnCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={ownNewPassword}
                onChange={e => setOwnNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <button type="submit" disabled={changePasswordBusy}>
              {changePasswordBusy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </section>
      )}

      <ApiTokensPanel signedIn={signedIn} isAdmin={isAdmin} users={users} />

      {isAdmin && (
        <section className="panel">
          <h2>Users</h2>
          <p className="muted small">
            Assign Admin, Read + write, or Read only roles. Admins can manage
            users, settings, and plugins.
          </p>
          <ul className="plain-list">
            {users.map(u => (
              <li key={u.id} className="user-row">
                {editUserId === u.id ? (
                  <form className="form-col" onSubmit={saveUser}>
                    <label>
                      Username
                      <input
                        value={editUsername}
                        onChange={e => setEditUsername(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      New password (optional)
                      <input
                        type="password"
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={editUserRoleId}
                        onChange={e =>
                          setEditUserRoleId(Number(e.target.value))
                        }
                      >
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="row-actions">
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setEditUserId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span>
                      <strong>{u.username}</strong>{' '}
                      <span className="muted small">({u.role_slug})</span>
                    </span>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditUserId(u.id)
                          setEditUsername(u.username)
                          setEditUserRoleId(u.role_id)
                          setEditPassword('')
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => void removeUser(u.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form className="form-col" onSubmit={createUser}>
            <h3>Add user</h3>
            <label>
              Username
              <input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </label>
            <label>
              Role
              <select
                value={newUserRoleId}
                onChange={e => setNewUserRoleId(Number(e.target.value))}
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Create user</button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section className="panel">
          <h2>Roles</h2>
          <p className="muted small">
            Built-in Admin and Read only roles cannot be changed. Custom roles
            can write (optional) and are limited to selected plugins.
          </p>
          <ul className="plain-list">
            {roles.map(r => (
              <li key={r.id} className="user-row">
                <div>
                  <strong>{r.name}</strong>{' '}
                  <span className="muted small">({r.slug})</span>
                  <div className="muted small">
                    {r.is_system
                      ? 'System role · all plugins'
                      : `${r.can_write ? 'Write' : 'Read-only'} · ${
                          r.plugins === 'all'
                            ? 'all plugins'
                            : `${r.plugins.length} plugin(s)`
                        }`}
                  </div>
                </div>
                {!r.is_system && (
                  <div className="row-actions">
                    <button type="button" onClick={() => startEditRole(r)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void removeRole(r.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <form
            className="form-col"
            onSubmit={editRoleId != null ? saveRole : createRole}
          >
            <h3>{editRoleId != null ? 'Edit role' : 'Add role'}</h3>
            <label>
              Name
              <input
                value={roleName}
                onChange={e => setRoleName(e.target.value)}
                required
              />
            </label>
            <label className="check-ids-item">
              <input
                type="checkbox"
                checked={roleCanWrite}
                onChange={e => setRoleCanWrite(e.target.checked)}
              />
              Allow writes
            </label>
            <fieldset className="plugin-allowlist">
              <legend>Plugin access</legend>
              {availablePlugins.length === 0 ? (
                <p className="muted small">No plugins loaded</p>
              ) : (
                availablePlugins.map(p => (
                  <label key={pluginKey(p)} className="check-ids-item">
                    <input
                      type="checkbox"
                      checked={rolePlugins.some(
                        x => pluginKey(x) === pluginKey(p),
                      )}
                      onChange={() => toggleRolePlugin(p)}
                    />
                    {p.kind}/{p.id}
                  </label>
                ))
              )}
            </fieldset>
            <div className="row-actions">
              <button type="submit">
                {editRoleId != null ? 'Save role' : 'Create role'}
              </button>
              {editRoleId != null && (
                <button type="button" onClick={cancelEditRole}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </>
  )
}
