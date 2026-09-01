import {StyleSheet, Text, View, type TextStyle, type ViewStyle} from 'react-native'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {statusLabel} from '@/utils/status'
import {Spacing} from '@/constants/umpire-theme'

export function StatusPill({
  isUp,
  enabled,
  label,
}: {
  isUp: number | null
  enabled: number
  label?: string
}) {
  const {colors} = useUmpireTheme()
  const status = statusLabel(isUp, enabled)

  const palette = {
    up: {bg: colors.pillUp, fg: colors.up},
    down: {bg: colors.pillDown, fg: colors.down},
    partial: {bg: colors.pillWarn, fg: colors.partial},
    paused: {bg: colors.pill, fg: colors.paused},
    pending: {bg: colors.pillWarn, fg: colors.pending},
  }[status]

  return (
    <View style={[styles.pill, {backgroundColor: palette.bg}]}>
      <Text style={[styles.pillText, {color: palette.fg}]}>
        {label ?? status}
      </Text>
    </View>
  )
}

export function ReconnectBanner() {
  const {colors} = useUmpireTheme()
  return (
    <View style={[styles.banner, {backgroundColor: colors.pillWarn}]}>
      <Text style={[styles.bannerText, {color: colors.warn}]}>
        Reconnecting to server…
      </Text>
    </View>
  )
}

export function ErrorText({children}: {children: string}) {
  const {colors} = useUmpireTheme()
  return <Text style={{color: colors.danger, marginVertical: Spacing.two}}>{children}</Text>
}

export function MutedText({
  children,
  style,
}: {
  children: React.ReactNode
  style?: TextStyle
}) {
  const {colors} = useUmpireTheme()
  return (
    <Text style={[{color: colors.textSecondary, fontSize: 14}, style]}>
      {children}
    </Text>
  )
}

export function Panel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: ViewStyle
}) {
  const {colors} = useUmpireTheme()
  return (
    <View
      style={[
        styles.panel,
        {backgroundColor: colors.panel, borderColor: colors.line},
        style,
      ]}>
      {children}
    </View>
  )
}

export function SectionTitle({children}: {children: React.ReactNode}) {
  const {colors} = useUmpireTheme()
  return (
    <Text style={[styles.sectionTitle, {color: colors.text}]}>{children}</Text>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  banner: {
    borderRadius: 8,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
})
