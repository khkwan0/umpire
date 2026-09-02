import {useCallback, useEffect, useMemo, useState} from 'react'
import {Alert, StyleSheet, Switch, Text, View} from 'react-native'
import {useRouter} from 'expo-router'
import {
  api,
  type Role,
  type RolePluginRef,
  type User,
} from '@umpire/mobile-api'
import type {AuthPluginSettingsProps} from '@umpire/plugin-ui'
import {useAuth} from '@umpire/mobile-auth'
import {Field, PrimaryButton, SecondaryButton} from '@umpire/mobile-form'
import {
  ErrorText,
  MutedText,
  Panel,
  SectionTitle,
} from '@umpire/mobile-ui'
import {useUmpireTheme} from '@umpire/mobile-theme'
import ApiTokensPanel from './ApiTokensPanel'

function pluginKey(p: RolePluginRef): string {
  return `${p.kind}:${p.id}`
}

function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: Role[]
  value: number | ''
  onChange: (roleId: number) => void
}) {
  const {colors} = useUmpireTheme()
  return (
    <View style={styles.rolePicker}>
      <MutedText>Role</MutedText>
      {roles.map(r => (
        <SecondaryButton
          key={r.id}
          title={value === r.id ? `${r.name} ✓` : r.name}
          onPress={() => onChange(r.id)}
          disabled={value === r.id}
        />
      ))}
      {roles.length === 0 ? (
        <MutedText style={{color: colors.textSecondary}}>No roles loaded</MutedText>
      ) : null}
    </View>
  )
}

export default function RbacSettings({pluginManager}: AuthPluginSettingsProps) {
  const {colors} = useUmpireTheme()
  const router = useRouter()
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

  async function onChangePassword() {
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

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  async function createUser() {
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

  async function saveUser() {
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

  function removeUser(id: number, username: string) {
    Alert.alert('Delete user', `Delete ${username}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
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
          })()
        },
      },
    ])
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

  async function createRole() {
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

  async function saveRole() {
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

  function removeRole(id: number, name: string) {
    Alert.alert('Delete role', `Delete role "${name}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setError(null)
            setMessage(null)
            try {
              await api.roles.remove(id)
              setMessage('Role deleted')
              await loadAdminLists()
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          })()
        },
      },
    ])
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
      {message ? <MutedText>{message}</MutedText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Panel>
        <SectionTitle>Account</SectionTitle>
        {signedIn ? (
          <>
            <MutedText>
              {`Signed in as ${principal?.user?.username ?? 'user'}`}
              {principal?.is_admin ? ' (admin)' : ''}
            </MutedText>
            <SecondaryButton title="Sign out" onPress={() => void handleLogout()} />
          </>
        ) : (
          <>
            <MutedText>Not signed in</MutedText>
            <PrimaryButton title="Sign in" onPress={() => router.push('/login')} />
          </>
        )}
      </Panel>

      {isAdmin ? (
        <Panel>
          <SectionTitle>Authentication</SectionTitle>
          <MutedText>
            Control whether visitors can browse without signing in. Write access
            always requires a signed-in account.
          </MutedText>
          <View style={styles.switchRow}>
            <Text style={{color: colors.text, flex: 1}}>
              Allow read-only access without signing in
            </Text>
            <Switch
              value={allowReadonlyWithoutAuth}
              onValueChange={setAllowReadonlyWithoutAuth}
            />
          </View>
          <PrimaryButton
            title={authConfigBusy ? 'Saving…' : 'Save authentication settings'}
            onPress={() => void onSaveAuthConfig()}
            disabled={authConfigBusy}
            loading={authConfigBusy}
          />
        </Panel>
      ) : null}

      {signedIn ? (
        <Panel>
          <SectionTitle>Change password</SectionTitle>
          <MutedText>
            {`Update the password for ${principal?.user?.username ?? 'your account'}.`}
          </MutedText>
          <Field
            label="Current password"
            value={ownCurrentPassword}
            onChangeText={setOwnCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="New password"
            value={ownNewPassword}
            onChangeText={setOwnNewPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <PrimaryButton
            title={changePasswordBusy ? 'Saving…' : 'Change password'}
            onPress={() => void onChangePassword()}
            disabled={changePasswordBusy}
            loading={changePasswordBusy}
          />
        </Panel>
      ) : null}

      <ApiTokensPanel signedIn={signedIn} isAdmin={isAdmin} users={users} />

      {isAdmin ? (
        <Panel>
          <SectionTitle>Users</SectionTitle>
          <MutedText>
            Assign Admin, Read + write, or Read only roles.
          </MutedText>
          {users.map(u => (
            <View key={u.id} style={[styles.listRow, {borderColor: colors.line}]}>
              {editUserId === u.id ? (
                <>
                  <Field
                    label="Username"
                    value={editUsername}
                    onChangeText={setEditUsername}
                    autoCapitalize="none"
                  />
                  <Field
                    label="New password (optional)"
                    value={editPassword}
                    onChangeText={setEditPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                  <RolePicker
                    roles={roles}
                    value={editUserRoleId}
                    onChange={setEditUserRoleId}
                  />
                  <View style={styles.rowActions}>
                    <PrimaryButton title="Save" onPress={() => void saveUser()} />
                    <SecondaryButton
                      title="Cancel"
                      onPress={() => setEditUserId(null)}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={{color: colors.text, fontWeight: '600'}}>
                    {u.username}
                  </Text>
                  <MutedText>{u.role_slug}</MutedText>
                  <View style={styles.rowActions}>
                    <SecondaryButton
                      title="Edit"
                      onPress={() => {
                        setEditUserId(u.id)
                        setEditUsername(u.username)
                        setEditUserRoleId(u.role_id)
                        setEditPassword('')
                      }}
                    />
                    <SecondaryButton
                      title="Delete"
                      danger
                      onPress={() => removeUser(u.id, u.username)}
                    />
                  </View>
                </>
              )}
            </View>
          ))}
          <SectionTitle>Add user</SectionTitle>
          <Field
            label="Username"
            value={newUsername}
            onChangeText={setNewUsername}
            autoCapitalize="none"
          />
          <Field
            label="Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <RolePicker
            roles={roles}
            value={newUserRoleId}
            onChange={setNewUserRoleId}
          />
          <PrimaryButton title="Create user" onPress={() => void createUser()} />
        </Panel>
      ) : null}

      {isAdmin ? (
        <Panel>
          <SectionTitle>Roles</SectionTitle>
          <MutedText>
            Built-in Admin and Read only roles cannot be changed.
          </MutedText>
          {roles.map(r => (
            <View key={r.id} style={[styles.listRow, {borderColor: colors.line}]}>
              <Text style={{color: colors.text, fontWeight: '600'}}>{r.name}</Text>
              <MutedText>{r.slug}</MutedText>
              <MutedText>
                {r.is_system
                  ? 'System role · all plugins'
                  : `${r.can_write ? 'Write' : 'Read-only'} · ${
                      r.plugins === 'all'
                        ? 'all plugins'
                        : `${r.plugins.length} plugin(s)`
                    }`}
              </MutedText>
              {!r.is_system ? (
                <View style={styles.rowActions}>
                  <SecondaryButton title="Edit" onPress={() => startEditRole(r)} />
                  <SecondaryButton
                    title="Delete"
                    danger
                    onPress={() => removeRole(r.id, r.name)}
                  />
                </View>
              ) : null}
            </View>
          ))}
          <SectionTitle>{editRoleId != null ? 'Edit role' : 'Add role'}</SectionTitle>
          <Field label="Name" value={roleName} onChangeText={setRoleName} />
          <View style={styles.switchRow}>
            <Text style={{color: colors.text, flex: 1}}>Allow writes</Text>
            <Switch value={roleCanWrite} onValueChange={setRoleCanWrite} />
          </View>
          <MutedText>Plugin access</MutedText>
          {availablePlugins.length === 0 ? (
            <MutedText>No plugins loaded</MutedText>
          ) : (
            availablePlugins.map(p => (
              <View key={pluginKey(p)} style={styles.switchRow}>
                <Text style={{color: colors.text, flex: 1}}>
                  {`${p.kind}/${p.id}`}
                </Text>
                <Switch
                  value={rolePlugins.some(x => pluginKey(x) === pluginKey(p))}
                  onValueChange={() => toggleRolePlugin(p)}
                />
              </View>
            ))
          )}
          <View style={styles.rowActions}>
            <PrimaryButton
              title={editRoleId != null ? 'Save role' : 'Create role'}
              onPress={() => void (editRoleId != null ? saveRole() : createRole())}
            />
            {editRoleId != null ? (
              <SecondaryButton title="Cancel" onPress={cancelEditRole} />
            ) : null}
          </View>
        </Panel>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  listRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  rolePicker: {
    marginTop: 8,
    gap: 8,
  },
})
