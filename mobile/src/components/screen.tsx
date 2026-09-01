import {ScrollView, StyleSheet, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

export function Screen({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode
  title?: string
  subtitle?: string
}) {
  const {colors} = useUmpireTheme()
  return (
    <SafeAreaView
      style={[styles.safe, {backgroundColor: colors.background}]}
      edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {title ? (
          <View style={styles.header}>
            <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five * 2,
  },
  header: {
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
  },
})
