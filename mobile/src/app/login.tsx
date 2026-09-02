import {useState} from 'react'
import {View} from 'react-native'
import {useRouter} from 'expo-router'
import {Screen} from '@/components/screen'
import {Field, PrimaryButton} from '@/components/form'
import {ErrorText} from '@/components/umpire-ui'
import {useAuth} from '@/providers/AuthProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

export default function LoginScreen() {
  const {login} = useAuth()
  const router = useRouter()
  const {colors} = useUmpireTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
      router.replace('/(tabs)')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Sign in" subtitle="UMPIRE monitoring console">
      <View
        style={{
          backgroundColor: colors.panel,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.line,
          padding: Spacing.three,
        }}>
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          title={busy ? 'Signing in…' : 'Sign in'}
          onPress={onSubmit}
          loading={busy}
          disabled={!username || !password}
        />
      </View>
    </Screen>
  )
}
