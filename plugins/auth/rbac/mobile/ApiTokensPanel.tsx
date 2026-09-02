import {useCallback, useEffect, useState} from 'react'
import {Alert, Share, StyleSheet, Text, View} from 'react-native'
import {api, type ApiToken, type User} from '@umpire/mobile-api'
import {Field, PrimaryButton, SecondaryButton} from '@umpire/mobile-form'
import {
  ErrorText,
  MutedText,
  Panel,
  SectionTitle,
} from '@umpire/mobile-ui'
import {Spacing} from '@umpire/mobile-spacing'

function formatTimestamp(value: string | null, fallback = 'Never'): string {
  if (!value) return fallback
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function ApiTokensPanel({
  signedIn,
  isAdmin,
  users,
}: {
  signedIn: boolean
  isAdmin: boolean
  users: User[]
}) {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)

  const usernameFor = useCallback(
    (userId: number) =>
      users.find(u => u.id === userId)?.username ?? `user #${userId}`,
    [users],
  )

  const loadTokens = useCallback(async () => {
    if (!signedIn) {
      setTokens([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      setTokens(await api.apiTokens.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setTokens([])
    } finally {
      setLoading(false)
    }
  }, [signedIn])

  useEffect(() => {
    void loadTokens()
  }, [loadTokens])

  async function createToken() {
    setBusy(true)
    setError(null)
    setMessage(null)
    setNewToken(null)
    try {
      const created = await api.apiTokens.create({
        label: label.trim() || undefined,
        expires_in_days: expiresInDays.trim()
          ? Number(expiresInDays)
          : null,
      })
      setNewToken(created.token)
      setLabel('')
      setExpiresInDays('')
      setMessage('Token created — copy or share it now; it will not be shown again.')
      await loadTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function revokeToken(id: number, tokenLabel: string) {
    Alert.alert(
      'Revoke token',
      `Revoke "${tokenLabel}"? Applications using it will lose access.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setError(null)
              setMessage(null)
              try {
                await api.apiTokens.remove(id)
                setMessage('Token revoked')
                setNewToken(null)
                await loadTokens()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            })()
          },
        },
      ],
    )
  }

  async function shareNewToken() {
    if (!newToken) return
    try {
      await Share.share({message: newToken})
    } catch {
      setError('Could not open share sheet')
    }
  }

  if (!signedIn) {
    return (
      <Panel>
        <SectionTitle>API tokens</SectionTitle>
        <MutedText>
          Bearer tokens for automation and scripts. Sign in to create and manage
          tokens.
        </MutedText>
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionTitle>API tokens</SectionTitle>
      <MutedText>
        Create Bearer tokens for scripts and integrations. Use Authorization:
        Bearer umpire_… on API requests.
      </MutedText>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {message ? <MutedText>{message}</MutedText> : null}

      {newToken ? (
        <View style={styles.reveal}>
          <MutedText>New token — shown once. Store it securely.</MutedText>
          <Text selectable style={styles.tokenSecret}>
            {newToken}
          </Text>
          <PrimaryButton title="Share token" onPress={() => void shareNewToken()} />
          <SecondaryButton title="Dismiss" onPress={() => setNewToken(null)} />
        </View>
      ) : null}

      <Field
        label="Label"
        value={label}
        onChangeText={setLabel}
        placeholder="e.g. CI monitor"
      />
      <Field
        label="Expires in days (optional)"
        value={expiresInDays}
        onChangeText={setExpiresInDays}
        keyboardType="number-pad"
        placeholder="Leave empty for no expiry"
      />
      <PrimaryButton
        title={busy ? 'Creating…' : 'Create token'}
        onPress={() => void createToken()}
        disabled={busy}
        loading={busy}
      />

      {loading ? (
        <MutedText style={styles.listMeta}>Loading tokens…</MutedText>
      ) : tokens.length === 0 ? (
        <MutedText style={styles.listMeta}>No tokens yet.</MutedText>
      ) : (
        tokens.map(token => (
          <View key={token.id} style={styles.tokenRow}>
            <Text style={styles.tokenLabel}>{token.label}</Text>
            <MutedText>{`${token.token_prefix}…`}</MutedText>
            {isAdmin ? (
              <MutedText>{usernameFor(token.user_id)}</MutedText>
            ) : null}
            <MutedText>{`Created ${formatTimestamp(token.created_at, '—')}`}</MutedText>
            <MutedText>
              {`Expires ${formatTimestamp(token.expires_at)}`}
            </MutedText>
            <MutedText>
              {`Last used ${formatTimestamp(token.last_used_at)}`}
            </MutedText>
            <SecondaryButton
              title="Revoke"
              danger
              onPress={() => revokeToken(token.id, token.label)}
            />
          </View>
        ))
      )}
    </Panel>
  )
}

const styles = StyleSheet.create({
  reveal: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.two,
    marginVertical: Spacing.two,
  },
  tokenSecret: {
    fontFamily: 'monospace',
    fontSize: 13,
    marginVertical: Spacing.one,
  },
  tokenLabel: {
    fontWeight: '600',
  },
  listMeta: {marginTop: Spacing.two},
  tokenRow: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    marginTop: Spacing.two,
    gap: 4,
  },
})
