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
import {
  api,
  isTransientApiError,
  type Group,
  type PluginManagerState,
  type Target,
} from '@/lib/api'
import {Field, PrimaryButton, SecondaryButton} from '@/components/form'
import {
  ErrorText,
  MutedText,
  Panel,
  ReconnectBanner,
  SectionTitle,
  StatusPill,
} from '@/components/umpire-ui'
import {useAuth} from '@/providers/AuthProvider'
import {useRealtimeRefresh} from '@/providers/RealtimeProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

const MIN_INTERVAL = 5

export default function TargetsScreen() {
  const {colors} = useUmpireTheme()
  const {canWrite} = useAuth()
  const [targets, setTargets] = useState<Target[]>([])
  const [statusTargets, setStatusTargets] = useState<Map<number, {is_up: number | null; enabled: number}>>(new Map())
  const [groups, setGroups] = useState<Group[]>([])
  const [pluginState, setPluginState] = useState<PluginManagerState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newInterval, setNewInterval] = useState('60')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, status, groupList, manager] = await Promise.all([
        api.targets.list(),
        api.status(),
        api.groups.list(),
        api.pluginManager.get(),
      ])
      setTargets(list)
      const map = new Map<number, {is_up: number | null; enabled: number}>()
      for (const t of status.targets) {
        map.set(t.id, {is_up: t.is_up, enabled: t.enabled})
      }
      setStatusTargets(map)
      setGroups(groupList)
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
  }, [load])
  useRealtimeRefresh(load)

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function toggleEnabled(target: Target) {
    if (!canWrite) return
    try {
      await api.targets.update(target.id, {enabled: !target.enabled})
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err))
    }
  }

  async function removeTarget(target: Target) {
    if (!canWrite) return
    Alert.alert('Delete target', `Remove ${target.url}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.targets.remove(target.id)
            await load()
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : String(err))
          }
        },
      },
    ])
  }

  async function addTarget() {
    const interval = Number(newInterval)
    if (!newUrl.trim() || !Number.isInteger(interval) || interval < MIN_INTERVAL) {
      Alert.alert('Invalid input', `URL required; interval must be ≥ ${MIN_INTERVAL}s`)
      return
    }
    setBusy(true)
    try {
      await api.targets.create({
        url: newUrl.trim(),
        interval_seconds: interval,
      })
      setNewUrl('')
      setNewInterval('60')
      setShowAdd(false)
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        <Text style={[styles.title, {color: colors.text}]}>Targets</Text>
        {!canWrite ? (
          <MutedText>Read-only — sign in with write access to make changes</MutedText>
        ) : null}

        {reconnecting ? <ReconnectBanner /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        {canWrite ? (
          <Panel>
            {showAdd ? (
              <>
                <SectionTitle>Add target</SectionTitle>
                <Field
                  label="URL"
                  value={newUrl}
                  onChangeText={setNewUrl}
                  autoCapitalize="none"
                  placeholder="https://example.com"
                />
                <Field
                  label="Interval (seconds)"
                  value={newInterval}
                  onChangeText={setNewInterval}
                  keyboardType="number-pad"
                />
                <PrimaryButton title="Create" onPress={addTarget} loading={busy} />
                <SecondaryButton title="Cancel" onPress={() => setShowAdd(false)} />
              </>
            ) : (
              <PrimaryButton title="Add target" onPress={() => setShowAdd(true)} />
            )}
          </Panel>
        ) : null}

        <Panel>
          <SectionTitle>
            {targets.length} target{targets.length === 1 ? '' : 's'}
          </SectionTitle>
          {targets.map(target => {
            const st = statusTargets.get(target.id)
            return (
              <View
                key={target.id}
                style={[styles.row, {borderBottomColor: colors.line}]}>
                <View style={styles.rowTop}>
                  <StatusPill
                    isUp={st?.is_up ?? null}
                    enabled={st?.enabled ?? target.enabled}
                  />
                  <Text style={[styles.url, {color: colors.text, flex: 1}]} numberOfLines={2}>
                    {target.url}
                  </Text>
                </View>
                <MutedText>
                  Every {target.interval_seconds}s
                  {target.group_id
                    ? ` · ${groups.find(g => g.id === target.group_id)?.tag ?? 'group'}`
                    : ''}
                </MutedText>
                {canWrite ? (
                  <View style={styles.actions}>
                    <View style={styles.switchRow}>
                      <Text style={{color: colors.text}}>Enabled</Text>
                      <Switch
                        value={!!target.enabled}
                        onValueChange={() => void toggleEnabled(target)}
                      />
                    </View>
                    <SecondaryButton
                      title="Delete"
                      danger
                      onPress={() => void removeTarget(target)}
                    />
                  </View>
                ) : null}
              </View>
            )
          })}
        </Panel>

        {pluginState ? (
          <Panel>
            <SectionTitle>Plugins</SectionTitle>
            <MutedText>
              {pluginState.checks.filter(c => c.enabled).length} checks,{' '}
              {pluginState.notifiers.filter(n => n.enabled).length} notifiers enabled
            </MutedText>
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
  row: {
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  rowTop: {flexDirection: 'row', alignItems: 'center', gap: Spacing.two},
  url: {fontSize: 15, fontWeight: '600'},
  actions: {marginTop: Spacing.two, gap: Spacing.two},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
