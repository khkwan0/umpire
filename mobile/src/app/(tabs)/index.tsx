import {useCallback, useEffect, useState} from 'react'
import {RefreshControl, StyleSheet, Text, View} from 'react-native'
import {ScrollView} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {
  api,
  isTransientApiError,
  type Incident,
  type PluginManagerState,
  type StatusResponse,
} from '@/lib/api'
import {
  ErrorText,
  MutedText,
  Panel,
  ReconnectBanner,
  SectionTitle,
  StatusPill,
} from '@/components/umpire-ui'
import {useRealtimeRefresh, useRealtime} from '@/providers/RealtimeProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {formatDuration, formatTimestamp} from '@/utils/status'
import {Spacing} from '@/constants/umpire-theme'

function StatBox({value, label, warn}: {value: number; label: string; warn?: boolean}) {
  const {colors} = useUmpireTheme()
  return (
    <View style={[styles.stat, {backgroundColor: colors.panel, borderColor: colors.line}]}>
      <Text style={[styles.statValue, {color: warn ? colors.warn : colors.text}]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, {color: colors.textSecondary}]}>{label}</Text>
    </View>
  )
}

export default function DashboardScreen() {
  const {colors} = useUmpireTheme()
  const {mode} = useRealtime()
  const [data, setData] = useState<StatusResponse | null>(null)
  const [pluginState, setPluginState] = useState<PluginManagerState | null>(null)
  const [incidents, setIncidents] = useState<Incident[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [status, log, manager] = await Promise.all([
        api.status(),
        api.incidents(50),
        api.pluginManager.get(),
      ])
      setData(status)
      setIncidents(log)
      setPluginState(manager)
      setError(null)
      setReconnecting(false)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setReconnecting(false)
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

  if (!data && !error) {
    return (
      <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]}>
        <MutedText>Loading…</MutedText>
      </SafeAreaView>
    )
  }

  const up = data?.targets.filter(t => t.enabled && t.is_up === 1).length ?? 0
  const partial = data?.targets.filter(t => t.enabled && t.is_up === 2).length ?? 0
  const down = data?.targets.filter(t => t.enabled && t.is_up === 0).length ?? 0
  const paused = data?.targets.filter(t => !t.enabled).length ?? 0
  const ongoing = (incidents ?? []).filter(i => !i.recovered).length

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        <Text style={[styles.title, {color: colors.text}]}>Dashboard</Text>
        <MutedText>
          {mode === 'sse' ? 'Live' : mode === 'polling' ? 'Polling' : 'Reconnecting'}
        </MutedText>

        {reconnecting ? <ReconnectBanner /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        <View style={styles.statsRow}>
          <StatBox value={up} label="up" />
          <StatBox value={partial} label="warning" warn={partial > 0} />
          <StatBox value={down} label="down" warn={down > 0} />
          <StatBox value={paused} label="paused" />
        </View>

        <Panel>
          <SectionTitle>Outages & recovery</SectionTitle>
          {ongoing > 0 ? (
            <Text style={{color: colors.down, fontWeight: '600', marginBottom: Spacing.two}}>
              {ongoing} ongoing
            </Text>
          ) : (
            <MutedText>No ongoing outages</MutedText>
          )}
          {(incidents ?? []).slice(0, 20).map(incident => (
            <View
              key={incident.id}
              style={[styles.row, {borderBottomColor: colors.line}]}>
              <StatusPill
                isUp={incident.recovered ? 1 : 0}
                enabled={1}
                label={incident.recovered ? 'recovered' : incident.status}
              />
              <Text style={[styles.url, {color: colors.text}]} numberOfLines={1}>
                {incident.url}
              </Text>
              <MutedText>
                {formatTimestamp(incident.started_at)}
                {incident.recovered
                  ? ` · ${formatDuration(incident.duration_seconds)}`
                  : ''}
              </MutedText>
              {incident.error ? (
                <Text style={{color: colors.danger, fontSize: 13}} numberOfLines={2}>
                  {incident.error}
                </Text>
              ) : null}
            </View>
          ))}
        </Panel>

        <Panel>
          <SectionTitle>Targets</SectionTitle>
          {(data?.targets ?? []).map(target => (
            <View
              key={target.id}
              style={[styles.row, {borderBottomColor: colors.line}]}>
              <View style={styles.targetHeader}>
                <StatusPill isUp={target.is_up} enabled={target.enabled} />
                <Text style={[styles.url, {color: colors.text, flex: 1}]} numberOfLines={1}>
                  {target.url}
                </Text>
              </View>
              <MutedText>
                {target.last_latency_ms != null
                  ? `${target.last_latency_ms}ms`
                  : '—'}
                {' · '}
                {formatTimestamp(target.last_checked_at)}
              </MutedText>
              {target.last_error ? (
                <Text style={{color: colors.danger, fontSize: 13}} numberOfLines={2}>
                  {target.last_error}
                </Text>
              ) : null}
            </View>
          ))}
        </Panel>

        {data?.settings ? (
          <Panel>
            <SectionTitle>Alert policy</SectionTitle>
            <MutedText>
              {data.settings.alert_policy}
              {data.settings.alert_policy === 'throttle'
                ? ` (${data.settings.throttle_minutes} min)`
                : ''}
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
  title: {fontSize: 28, fontWeight: '800', marginBottom: 4},
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginVertical: Spacing.three,
  },
  stat: {
    flex: 1,
    minWidth: '40%',
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.two,
    alignItems: 'center',
  },
  statValue: {fontSize: 24, fontWeight: '800'},
  statLabel: {fontSize: 12, textTransform: 'uppercase', marginTop: 2},
  row: {
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  url: {fontSize: 15, fontWeight: '600'},
})
