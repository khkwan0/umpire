import {useCallback, useEffect, useRef, useState} from 'react'
import {Link} from 'react-router-dom'
import {websocketUrl} from '../basePath'
import {api, type AgentStatus} from '../api'

type ChatRole = 'user' | 'assistant'

interface ChatEntry {
  id: string
  role: ChatRole
  content: string
  reasoning?: string
  tools?: Array<{name: string; summary?: string; running?: boolean}>
}

const WS_PATH = '/api/agent/ws'
const WS_RETRY_MS = 3000

export default function AgentPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)
  const wasBusyRef = useRef(false)

  useEffect(() => {
    void api.agent
      .status()
      .then(setStatus)
      .catch(err =>
        setError(err instanceof Error ? err.message : 'Failed to load status'),
      )
  }, [])

  const attachHandlers = useCallback((ws: WebSocket) => {
    ws.onmessage = ev => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(String(ev.data)) as Record<string, unknown>
      } catch {
        return
      }
      const type = String(msg.type ?? '')
      const id = String(msg.id ?? '')

      if (type === 'ready') {
        setError(null)
        setStatus({
          enabled: Boolean(msg.enabled),
          configured: Boolean(msg.configured),
          provider: (msg.provider as string | null) ?? null,
          model: (msg.model as string | null) ?? null,
        })
        return
      }

      if (id !== pendingIdRef.current && type !== 'error') return

      if (type === 'tool_start') {
        const tool = String(msg.tool ?? '')
        setEntries(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const tools = [...(last.tools ?? [])]
          tools.push({name: tool, running: true})
          return [...prev.slice(0, -1), {...last, tools}]
        })
      } else if (type === 'tool_end') {
        const tool = String(msg.tool ?? '')
        const summary = String(msg.summary ?? '')
        setEntries(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const tools = (last.tools ?? []).map(t =>
            t.name === tool && t.running
              ? {name: tool, summary, running: false}
              : t,
          )
          return [...prev.slice(0, -1), {...last, tools}]
        })
      } else if (type === 'reasoning_delta') {
        const delta = String(msg.delta ?? '')
        if (!delta) return
        setEntries(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [
            ...prev.slice(0, -1),
            {...last, reasoning: (last.reasoning ?? '') + delta},
          ]
        })
      } else if (type === 'assistant_delta') {
        const delta = String(msg.delta ?? '')
        if (!delta) return
        setEntries(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [
            ...prev.slice(0, -1),
            {...last, content: last.content + delta},
          ]
        })
      } else if (type === 'assistant' || type === 'done') {
        const message = String(msg.message ?? '')
        const reasoning =
          typeof msg.reasoning === 'string' ? msg.reasoning : undefined
        setEntries(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') {
            return [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: message,
                reasoning,
              },
            ]
          }
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: message || last.content,
              reasoning: reasoning || last.reasoning,
            },
          ]
        })
        if (type === 'done') {
          setBusy(false)
          pendingIdRef.current = null
        }
      } else if (type === 'error') {
        setError(String(msg.error ?? 'Agent error'))
        setBusy(false)
        pendingIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    unmountedRef.current = false

    const scheduleRetry = () => {
      if (unmountedRef.current || retryTimerRef.current) return
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        connect()
      }, WS_RETRY_MS)
    }

    function connect() {
      if (unmountedRef.current) return
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return
      }

      const ws = new WebSocket(websocketUrl(WS_PATH))
      wsRef.current = ws
      attachHandlers(ws)

      ws.onopen = () => {
        setConnected(true)
        setError(null)
      }

      ws.onclose = () => {
        setConnected(false)
        if (wsRef.current === ws) {
          wsRef.current = null
        }
        if (!unmountedRef.current) {
          scheduleRetry()
        }
      }

      ws.onerror = () => {
        setConnected(false)
        setError(
          `WebSocket connection failed (${websocketUrl(WS_PATH)}). Check that your reverse proxy forwards Upgrade requests for this path.`,
        )
      }
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [attachHandlers])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [entries, busy])

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setError(null)

    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Not connected — retrying…')
      return
    }

    const id = crypto.randomUUID()
    pendingIdRef.current = id
    setBusy(true)
    setInput('')

    setEntries(prev => [
      ...prev,
      {id: `u-${id}`, role: 'user', content: text},
      {
        id: `a-${id}`,
        role: 'assistant',
        content: '',
        reasoning: '',
        tools: [],
      },
    ])

    const history = entries
      .filter(e => e.content)
      .map(e => ({role: e.role, content: e.content}))

    ws.send(
      JSON.stringify({
        type: 'chat',
        id,
        message: text,
        history,
      }),
    )
  }

  const chatAvailable = Boolean(status?.enabled && status?.configured)

  useEffect(() => {
    if (wasBusyRef.current && !busy && chatAvailable) {
      inputRef.current?.focus()
    }
    wasBusyRef.current = busy
  }, [busy, chatAvailable])

  const statusLine = !status
    ? 'Loading…'
    : !status.enabled
      ? 'AI agent is disabled'
      : !status.configured
        ? 'LLM not configured'
        : `Model: ${status.provider}/${status.model}`

  const inputPlaceholder = !status?.enabled
    ? 'Agent is disabled'
    : !status?.configured
      ? 'Configure the agent in Settings first'
      : 'Ask the monitoring assistant…'

  const streamingEntryId = busy ? entries[entries.length - 1]?.id : undefined

  return (
    <div className="agent-page">
      <div className="agent-header">
        <div>
          <h1>Agent</h1>
          <p className="muted small">
            {statusLine}
            {connected ? ' · connected' : status ? ' · connecting…' : ''}
          </p>
        </div>
      </div>

      {status && !status.enabled && (
        <p className="warn">
          The AI agent is turned off. An admin can enable it under{' '}
          <Link to="/settings">Settings → AI Agent</Link>.
        </p>
      )}

      {status?.enabled && !status.configured && (
        <p className="warn">
          The agent is enabled but not fully configured. Set up a provider and
          model under <Link to="/settings">Settings → AI Agent</Link>.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="agent-log panel">
        {entries.length === 0 && (
          <p className="muted">
            {status && !status.enabled
              ? 'Chat is unavailable while the agent is disabled.'
              : 'Ask about target health, open incidents, or monitoring configuration. Example: "What targets are down right now?"'}
          </p>
        )}
        {entries.map(entry => (
          <div key={entry.id} className={`agent-msg agent-msg-${entry.role}`}>
            <strong>{entry.role === 'user' ? 'You' : 'Agent'}</strong>
            {entry.tools && entry.tools.length > 0 && (
              <ul className="agent-tools">
                {entry.tools.map(t => (
                  <li key={t.name}>
                    <code>{t.name}</code>
                    {t.running
                      ? ' …'
                      : t.summary
                        ? `: ${t.summary.slice(0, 160)}…`
                        : ''}
                  </li>
                ))}
              </ul>
            )}
            {entry.reasoning ? (
              <details className="agent-reasoning" open>
                <summary>Reasoning</summary>
                <p>
                  {entry.reasoning}
                  {busy &&
                    entry.role === 'assistant' &&
                    !entry.content &&
                    entry.id === streamingEntryId && (
                      <span className="agent-cursor">▋</span>
                    )}
                </p>
              </details>
            ) : null}
            {entry.content ? (
              <p>
                {entry.content}
                {busy &&
                  entry.role === 'assistant' &&
                  entry.id === streamingEntryId && (
                    <span className="agent-cursor">▋</span>
                  )}
              </p>
            ) : busy && entry.role === 'assistant' && !entry.reasoning ? (
              <p className="muted">Thinking…</p>
            ) : null}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="agent-input-row">
        <textarea
          ref={inputRef}
          className="agent-input"
          rows={2}
          value={input}
          disabled={busy || !chatAvailable}
          placeholder={inputPlaceholder}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="button"
          disabled={busy || !input.trim() || !chatAvailable}
          onClick={send}
        >
          Send
        </button>
      </div>
    </div>
  )
}
