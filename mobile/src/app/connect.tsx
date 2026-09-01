import {useState} from 'react'
import {Text, View} from 'react-native'
import {useRouter} from 'expo-router'
import {api} from '@/lib/api'
import {Screen} from '@/components/screen'
import {Field, PrimaryButton} from '@/components/form'
import {ErrorText} from '@/components/umpire-ui'
import {useServer} from '@/providers/ServerProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

export default function ConnectScreen() {
  const {connect} = useServer()
  const router = useRouter()
  const {colors} = useUmpireTheme()
  const [url, setUrl] = useState('http://localhost:8089')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onConnect() {
    setBusy(true)
    setError(null)
    try {
      await connect(url.trim())
      await api.health()
      router.replace('/(tabs)')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="UMPIRE" subtitle="Connect to your monitoring server">
      <View
        style={{
          backgroundColor: colors.panel,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.line,
          padding: Spacing.three,
        }}>
        <Text style={{color: colors.textSecondary, marginBottom: Spacing.two}}>
          Enter the URL where UMPIRE is hosted. This is usually your web UI
          address, e.g. http://localhost:8089 or https://umpire.example.com
        </Text>
        <Field
          label="Server URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://umpire.example.com"
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton title="Connect" onPress={onConnect} loading={busy} />
      </View>
    </Screen>
  )
}
