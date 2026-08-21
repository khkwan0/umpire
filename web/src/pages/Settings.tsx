import {useEffect, useMemo, useState, type FormEvent} from 'react'
import {
  api,
  isTransientApiError,
  type AlertPolicy,
  type PluginManagerState,
  type Role,
  type RolePluginRef,
  type Settings,
  type User,
} from '../api'
import {useAuth} from '../auth'
import ReconnectBanner from '../ReconnectBanner'
import ThemeSwitcher from '../ThemeSwitcher'
import TimezoneSelect from '../TimezoneSelect'
import {useOnboarding} from '../onboarding'

const MISSING_PLUGIN_DESCRIPTION =
  "No description offered by the plugin's author"

function displayedPluginDescription(
  description: string | null | undefined,
): string {
  const trimmed = description?.trim()
  return trimmed ? trimmed : MISSING_PLUGIN_DESCRIPTION
}

function PluginManagerRow({
  id,
  enabled,
  description,
  busy,
  extra,
  onToggle,
}: {
  id: string
  enabled: boolean
  description: string | null
  busy: boolean
  extra?: string
  onToggle: (enabled: boolean) => void
}) {
  return (
    <div className="plugin-manager-row">
      <label className="check-ids-item">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={e => onToggle(e.target.checked)}
        />
        {id}
        {extra}
      </label>
      <p className="muted small plugin-manager-description">
        {displayedPluginDescription(description)}
      </p>
    </div>
  )
}

function pluginKey(p: RolePluginRef): string {
  return `${p.kind}:${p.id}`
}

export default function SettingsPage() {
  const {restart} = useOnboarding()
  const {principal, refresh: refreshAuth, policy} = useAuth()
  const isAdmin = Boolean(principal?.is_admin)
  const canWrite = Boolean(principal?.can_write)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [policyAlert, setPolicyAlert] = useState<AlertPolicy>('state_change')
  const [throttle, setThrottle] = useState(30)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [allowReadonly, setAllowReadonly] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [plugins, setPlugins] = useState<PluginManagerState | null>(null)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)

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
    if (!plugins) return [] as RolePluginRef[]
    const list: RolePluginRef[] = [
      {kind: 'scheduler', id: plugins.scheduler.id},
      ...plugins.checks.map(c => ({kind: 'check' as const, id: c.id})),
      ...plugins.notifiers.map(n => ({kind: 'notify' as const, id: n.id})),
    ]
    return list
  }, [plugins])

  async function loadAdminLists() {
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
  }

  useEffect(() => {
    void Promise.all([api.settings.get(), api.pluginManager.get()])
      .then(async ([s, p]) => {
        setSettings(s)
        setPolicyAlert(s.alert_policy)
        setThrottle(s.throttle_minutes)
        setAuthEnabled(s.auth_enabled)
        setAllowReadonly(s.allow_readonly_without_auth)
        setPlugins(p)
        setError(null)
        setReconnecting(false)
        if (principal?.is_admin) {
          const [u, r] = await Promise.all([api.users.list(), api.roles.list()])
          setUsers(u)
          setRoles(r)
          const admin = r.find(role => role.slug === 'admin')
          setNewUserRoleId(admin?.id ?? r[0]?.id ?? '')
        }
      })
      .catch(err => {
        if (isTransientApiError(err)) {
          setReconnecting(true)
          return
        }
        setError(err instanceof Error ? err.message : String(err))
        setReconnecting(false)
      })
  }, [principal?.is_admin])

  async function togglePlugin(
    kind: 'check' | 'notify' | 'scheduler',
    id: string,
    enabled: boolean,
  ) {
    const key = `${kind}:${id}`
    setPluginBusy(key)
    setError(null)
    setMessage(null)
    try {
      await api.pluginManager.setEnabled(kind, id, enabled)
      const next = await api.pluginManager.get()
      setPlugins(next)
      setMessage('Plugin state updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPluginBusy(null)
    }
  }

  async function onSaveAlert(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await api.settings.put({
        alert_policy: policyAlert,
        throttle_minutes: throttle,
      })
      setSettings(next)
      setMessage('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSaveAuth(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await api.settings.put({
        auth_enabled: authEnabled,
        allow_readonly_without_auth: allowReadonly,
      })
      setSettings(next)
      setAuthEnabled(next.auth_enabled)
      setAllowReadonly(next.allow_readonly_without_auth)
      setMessage('Auth settings saved')
      await refreshAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
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

  if (!settings && !error && !reconnecting)
    return <p className="muted">Loading…</p>

  const userCount = users.length || policy?.user_count || 0

  return (
    <div className="stack">
      {reconnecting && <ReconnectBanner />}
      <section className="panel">
        <h2 id="appearance-heading">Appearance</h2>
        <p className="muted small">
          Theme and timezone preferences apply to the whole dashboard, including
          plugin pages. Timestamps from the API are stored in UTC.
        </p>
        <ThemeSwitcher labelledBy="appearance-heading" />
        <TimezoneSelect labelledBy="appearance-heading" />
      </section>
      <section className="panel">
        <h2>Setup tutorial</h2>
        <p className="muted small">
          Replay the first-run walkthrough for adding a target and a notifier,
          even if you skipped or finished it.
        </p>
        <button type="button" onClick={restart}>
          Rerun tutorial
        </button>
      </section>
      <section className="panel">
        <h2>Alert policy</h2>
        <form className="form-col" onSubmit={onSaveAlert}>
          <label>
            Policy
            <select
              value={policyAlert}
              onChange={e => setPolicyAlert(e.target.value as AlertPolicy)}
              disabled={!isAdmin}
            >
              <option value="state_change">
                State change (down once, recover once)
              </option>
              <option value="every_fail">Every failed check</option>
              <option value="throttle">
                Throttle (first fail, then at most every N minutes)
              </option>
            </select>
          </label>
          <label>
            Throttle minutes
            <input
              type="number"
              min={1}
              value={throttle}
              onChange={e => setThrottle(Number(e.target.value))}
              disabled={policyAlert !== 'throttle' || !isAdmin}
            />
          </label>
          <button type="submit" disabled={busy || !isAdmin}>
            Save
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Authentication</h2>
        <p className="muted small">
          Auth starts disabled. Create at least one user before enabling auth.
          When auth is on, mutations require a signed-in user with write access.
        </p>
        <form className="form-col" onSubmit={onSaveAuth}>
          <label className="check-ids-item">
            <input
              type="checkbox"
              checked={authEnabled}
              disabled={!isAdmin || (userCount < 1 && !authEnabled)}
              onChange={e => setAuthEnabled(e.target.checked)}
            />
            Enable authentication
          </label>
          <label className="check-ids-item">
            <input
              type="checkbox"
              checked={allowReadonly}
              disabled={!isAdmin || !authEnabled}
              onChange={e => setAllowReadonly(e.target.checked)}
            />
            Allow read-only access without signing in
          </label>
          <button type="submit" disabled={busy || !isAdmin}>
            Save auth settings
          </button>
        </form>
        {userCount < 1 && (
          <p className="muted small">
            Create a user below before enabling authentication.
          </p>
        )}
      </section>

      {isAdmin && (
        <section className="panel">
          <h2>Users</h2>
          <p className="muted small">
            With a single user, that account is always treated as admin with
            full access.
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
                      <button
                        type="button"
                        onClick={() => void removeUser(u.id)}
                      >
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
                minLength={8}
              />
            </label>
            <label>
              Role
              <select
                value={newUserRoleId}
                onChange={e => setNewUserRoleId(Number(e.target.value))}
                required
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

      <section className="panel">
        <h2>Plugin manager</h2>
        {!plugins ? (
          <p className="muted">Loading plugins…</p>
        ) : (
          <div className="stack">
            <div>
              <h3>Scheduler</h3>
              <div className="plugin-manager-list">
                <PluginManagerRow
                  id={plugins.scheduler.id}
                  enabled={plugins.scheduler.enabled}
                  description={plugins.scheduler.description}
                  busy={pluginBusy === `scheduler:${plugins.scheduler.id}`}
                  onToggle={enabled => {
                    if (!isAdmin) return
                    void togglePlugin(
                      'scheduler',
                      plugins.scheduler.id,
                      enabled,
                    )
                  }}
                />
              </div>
            </div>

            <div>
              <h3>Checks</h3>
              <div className="plugin-manager-list">
                {plugins.checks.map(c => (
                  <PluginManagerRow
                    key={c.id}
                    id={c.id}
                    enabled={c.enabled}
                    description={c.description}
                    busy={pluginBusy === `check:${c.id}`}
                    onToggle={enabled => {
                      if (!isAdmin) return
                      void togglePlugin('check', c.id, enabled)
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3>Notifiers</h3>
              <div className="plugin-manager-list">
                {plugins.notifiers.map(n => (
                  <PluginManagerRow
                    key={n.id}
                    id={n.id}
                    enabled={n.enabled}
                    description={n.description}
                    busy={pluginBusy === `notify:${n.id}`}
                    extra={!n.ready ? ' (not ready)' : undefined}
                    onToggle={enabled => {
                      if (!isAdmin) return
                      void togglePlugin('notify', n.id, enabled)
                    }}
                  />
                ))}
              </div>
            </div>
            {!isAdmin && (
              <p className="muted small">
                Plugin enable/disable requires admin access.
              </p>
            )}
          </div>
        )}
      </section>

      {message && <p className="ok-text">{message}</p>}
      {error && <p className="error">{error}</p>}
      {!canWrite && settings?.auth_enabled && (
        <p className="muted small">
          You are in read-only mode; mutating settings requires write access.
        </p>
      )}
    </div>
  )
}
