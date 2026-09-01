import {Redirect, Stack, useSegments, ThemeProvider, DarkTheme, DefaultTheme} from 'expo-router'
import {ActivityIndicator, View} from 'react-native'
import {AuthProvider, useAuth} from '@/providers/AuthProvider'
import {RealtimeProvider} from '@/providers/RealtimeProvider'
import {ServerProvider, useServer} from '@/providers/ServerProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'

function RootNavigator() {
  const {ready: serverReady, serverUrl} = useServer()
  const {ready: authReady, policy, principal} = useAuth()
  const {colors} = useUmpireTheme()
  const segments = useSegments()
  const onAuthScreen =
    segments[0] === 'connect' || segments[0] === 'login'

  if (!serverReady || !authReady) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  if (!serverUrl && !onAuthScreen) {
    return <Redirect href="/connect" />
  }

  const needsLogin =
    serverUrl &&
    policy?.login_required &&
    principal?.kind !== 'user' &&
    segments[0] !== 'login'

  if (needsLogin) {
    return <Redirect href="/login" />
  }

  if (serverUrl && segments[0] === 'connect') {
    return <Redirect href="/(tabs)" />
  }

  if (principal?.kind === 'user' && segments[0] === 'login') {
    return <Redirect href="/(tabs)" />
  }

  return (
    <Stack screenOptions={{headerShown: false}}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="connect" options={{presentation: 'modal'}} />
      <Stack.Screen name="login" />
    </Stack>
  )
}

function ThemedRoot() {
  const {colors, isDark} = useUmpireTheme()
  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: colors.background,
          card: colors.panel,
          text: colors.text,
          border: colors.line,
          primary: colors.accent,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.background,
          card: colors.panel,
          text: colors.text,
          border: colors.line,
          primary: colors.accent,
        },
      }

  return (
    <ThemeProvider value={navTheme}>
      <ServerProvider>
        <AuthProvider>
          <RealtimeProvider>
            <RootNavigator />
          </RealtimeProvider>
        </AuthProvider>
      </ServerProvider>
    </ThemeProvider>
  )
}

export default function RootLayout() {
  return <ThemedRoot />
}
