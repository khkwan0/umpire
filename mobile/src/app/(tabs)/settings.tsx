import {useCallback, useEffect, useState} from 'react'
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {useRouter} from 'expo-router'
import {
  api,
  isTransientApiError,
  type AlertPolicy,
  type PluginManagerState,
  type Settings,
} from '@/lib/api'
import {
  clearBearerToken,
  clearSessionCookie,
  getBearerToken,
  setBearerToken,
} from '@/lib/storage'
import {Field, PrimaryButton, SecondaryButton} from '@/components/form'
import {
  ErrorText,
  MutedText,
  Panel,
  ReconnectBanner,
  SectionTitle,
} from '@/components/umpire-ui'
import {useAuth} from '@/providers/AuthProvider'
import {useServer} from '@/providers/ServerProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

const POLICIES: AlertPolicy[] = ['state_change', 'every_fail', 'throttle']

export default function SettingsScreen() {
  const {colors} = useUmpireTheme()
  const {serverUrl, disconnect} = useServer()
  const {principal, policy, logout, canWrite} = useAuth()
  const router = useRouter()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pluginState, setPluginState] = useState<PluginManagerState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [bearerDraft, setBearerDraft] = useState('')
  const [hasBearer, setHasBearer] = useState(false)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, manager] = await Promise.all([
        api.settings.get(),
        api.pluginManager.get(),
      ])
      setSettings(s)
      setPluginState(manager)
      setError(null)
      setReconnecting(false)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
    void getBearerToken().then(t => setHasBearer(!!t))
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function updatePolicy(next: AlertPolicy) {
    if (!canWrite) return
    try {
      const updated = await api.settings.put({alert_policy: next})
      setSettings(updated)
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err))
    }
  }

  async function togglePlugin(
    kind: 'check' | 'notify' | 'scheduler',
    id: string,
    enabled: boolean,
  ) {
    if (!canWrite || !principal?.is_admin) return
    const key = `${kind}:${id}`
    setPluginBusy(key)
    try {
      await api.pluginManager.setEnabled(kind, id, enabled)
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err))
    } finally {
      setPluginBusy(null)
    }
  }

  async function saveBearer() {
    const token = bearerDraft.trim()
    if (token) await setBearerToken(token)
    else await clearBearerToken()
    setHasBearer(!!token)
    setBearerDraft('')
    Alert.alert('Saved', 'API token updated')
  }

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  async function handleDisconnect() {
    await clearSessionCookie()
    await clearBearerToken()
    await disconnect()
    router.replace('/connect')
  }

  const isAdmin = principal?.is_admin ?? false

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        <Text style={[styles.title, {color: colors.text}]}>Settings</Text>

        {reconnecting ? <ReconnectBanner /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        <Panel>
          <SectionTitle>Server</SectionTitle>
          <MutedText>{serverUrl}</MutedText>
          <SecondaryButton title="Change server" onPress={() => void handleDisconnect()} />
        </Panel>

        <Panel>
          <SectionTitle>Account</SectionTitle>
          {principal?.kind === 'user' ? (
            <>
              <MutedText>
                {`Signed in as ${principal.user?.username ?? 'user'}`}
                {principal.is_admin ? ' (admin)' : ''}
              </MutedText>
              <SecondaryButton title="Sign out" onPress={() => void handleLogout()} />
            </>
          ) : (
            <>
              <MutedText>
                {policy?.auth_enabled
                  ? 'Anonymous session'
                  : 'Authentication disabled'}
              </MutedText>
              {policy?.auth_enabled ? (
                <PrimaryButton
                  title="Sign in"
                  onPress={() => router.push('/login')}
                />
              ) : null}
            </>
          )}
        </Panel>

        <Panel>
          <SectionTitle>API token (optional)</SectionTitle>
          <MutedText>
            Use a Bearer token if session cookies are not working on this device.
            {hasBearer ? ' Token saved.' : ''}
          </MutedText>
          <Field
            label="Bearer token"
            value={bearerDraft}
            onChangeText={setBearerDraft}
            autoCapitalize="none"
            secureTextEntry
            placeholder="umpire_…"
          />
          <PrimaryButton title="Save token" onPress={() => void saveBearer()} />
        </Panel>

        {settings ? (
          <Panel>
            <SectionTitle>Alert policy</SectionTitle>
            {POLICIES.map(p => (
              <View key={p} style={styles.policyRow}>
                <Text style={{color: colors.text, flex: 1}}>{p}</Text>
                <Switch
                  value={settings.alert_policy === p}
                  onValueChange={() => void updatePolicy(p)}
                  disabled={!canWrite}
                />
              </View>
            ))}
          </Panel>
        ) : null}

        {pluginState && isAdmin ? (
          <Panel>
            <SectionTitle>Plugin manager</SectionTitle>
            <MutedText>Scheduler: {pluginState.scheduler.id}</MutedText>
            <View style={styles.switchRow}>
              <Text style={{color: colors.text}}>Interval scheduler</Text>
              <Switch
                value={pluginState.scheduler.enabled}
                onValueChange={v =>
                  void togglePlugin('scheduler', pluginState.scheduler.id, v)
                }
                disabled={pluginBusy === `scheduler:${pluginState.scheduler.id}`}
              />
            </View>
            <SectionTitle>Checks</SectionTitle>
            {pluginState.checks.map(c => (
              <View key={c.id} style={styles.switchRow}>
                <Text style={{color: colors.text}}>{c.id}</Text>
                <Switch
                  value={c.enabled}
                  onValueChange={v => void togglePlugin('check', c.id, v)}
                  disabled={pluginBusy === `check:${c.id}`}
                />
              </View>
            ))}
            <SectionTitle>Notifiers</SectionTitle>
            {pluginState.notifiers.map(n => (
              <View key={n.id} style={styles.switchRow}>
                <Text style={{color: colors.text}}>
                  {n.id}
                  {n.ready ? '' : ' (not ready)'}
                </Text>
                <Switch
                  value={n.enabled}
                  onValueChange={v => void togglePlugin('notify', n.id, v)}
                  disabled={pluginBusy === `notify:${n.id}`}
                />
              </View>
            ))}
          </Panel>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {padding: Spacing.three, paddingBottom: 80},
  title: {fontSize: 28, fontWeight: '800', marginBottom: Spacing.two},
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
})
