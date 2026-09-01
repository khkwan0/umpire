import {useCallback, useEffect, useRef, useState} from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {
  agentWsUrl,
  api,
  type AgentChat,
  type AgentStatus,
} from '@/lib/api'
import {setStoredActiveChatId} from '@/lib/storage'
import {PrimaryButton, SecondaryButton} from '@/components/form'
import {ErrorText, MutedText, Panel, SectionTitle} from '@/components/umpire-ui'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
}

export default function AgentScreen() {
  const {colors} = useUmpireTheme()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [chats, setChats] = useState<AgentChat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const refreshChats = useCallback(async () => {
    try {
      const list = await api.agent.chats.list()
      setChats(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats')
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.agent.status()
        setStatus(s)
        await refreshChats()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [refreshChats])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ws = new WebSocket(agentWsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        if (!cancelled) setConnected(true)
      }
      ws.onclose = () => {
        if (!cancelled) setConnected(false)
      }
      ws.onmessage = event => {
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>
          if (msg.type === 'assistant_delta' && typeof msg.delta === 'string') {
            setEntries(prev => {
              const last = prev[prev.length - 1]
              if (last?.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  {...last, content: last.content + msg.delta},
                ]
              }
              return [
                ...prev,
                {id: `a-${Date.now()}`, role: 'assistant', content: msg.delta as string},
              ]
            })
          }
          if (msg.type === 'done') {
            setBusy(false)
            void refreshChats()
          }
          if (msg.type === 'error' && typeof msg.message === 'string') {
            setError(msg.message)
            setBusy(false)
          }
        } catch {
          // ignore parse errors
        }
      }
    })()
    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [refreshChats])

  async function selectChat(chatId: string) {
    setError(null)
    try {
      const chat = await api.agent.chats.get(chatId)
      setEntries(
        chat.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          reasoning: m.reasoning ?? undefined,
        })),
      )
      setActiveChatId(chatId)
      await setStoredActiveChatId(chatId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function newChat() {
    try {
      const chat = await api.agent.chats.create()
      setChats(prev => [chat, ...prev])
      setActiveChatId(chat.id)
      setEntries([])
      await setStoredActiveChatId(chat.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function sendMessage() {
    const text = input.trim()
    if (!text || !activeChatId || busy) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected')
      return
    }
    const id = `msg-${Date.now()}`
    setEntries(prev => [...prev, {id, role: 'user', content: text}])
    setInput('')
    setBusy(true)
    setError(null)
    ws.send(
      JSON.stringify({
        type: 'chat',
        id,
        message: text,
        chat_id: activeChatId,
      }),
    )
  }

  if (!status?.enabled) {
    return (
      <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]}>
        <View style={styles.content}>
          <Text style={[styles.title, {color: colors.text}]}>Agent</Text>
          <MutedText>
            AI agent is not enabled. Configure it in Settings on the web UI or
            server.
          </MutedText>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]} edges={['top']}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={[styles.title, {color: colors.text}]}>Agent</Text>
          <MutedText>
            {status.provider ?? '—'} / {status.model ?? '—'}
            {connected ? ' · connected' : ' · disconnected'}
          </MutedText>
          {error ? <ErrorText>{error}</ErrorText> : null}

          <Panel>
            <View style={styles.chatActions}>
              <PrimaryButton title="New chat" onPress={() => void newChat()} />
            </View>
            <FlatList
              horizontal
              data={chats}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <SecondaryButton
                  title={item.title || 'Chat'}
                  onPress={() => void selectChat(item.id)}
                />
              )}
              style={{marginVertical: Spacing.two}}
            />
          </Panel>

          <FlatList
            style={{flex: 1}}
            data={entries}
            keyExtractor={item => item.id}
            renderItem={({item}) => (
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor:
                      item.role === 'user' ? colors.accent : colors.panel,
                    alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                  },
                ]}>
                <Text
                  style={{
                    color: item.role === 'user' ? colors.buttonFg : colors.text,
                  }}>
                  {item.content}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <MutedText>
                {activeChatId ? 'Send a message to start' : 'Select or create a chat'}
              </MutedText>
            }
          />

          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.line,
                  backgroundColor: colors.panel,
                },
              ]}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your monitoring…"
              placeholderTextColor={colors.textSecondary}
              multiline
              editable={!!activeChatId && !busy}
            />
            <PrimaryButton
              title="Send"
              onPress={sendMessage}
              disabled={!activeChatId || busy || !input.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {flex: 1, padding: Spacing.three, paddingBottom: 80},
  title: {fontSize: 28, fontWeight: '800'},
  chatActions: {marginBottom: Spacing.two},
  bubble: {
    borderRadius: 12,
    padding: Spacing.two,
    marginVertical: 4,
    maxWidth: '85%',
  },
  inputRow: {paddingTop: Spacing.two},
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
    marginBottom: Spacing.two,
    maxHeight: 120,
  },
})
