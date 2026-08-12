import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type FcmToken } from '../api'

export default function Tokens() {
  const [tokens, setTokens] = useState<FcmToken[]>([])
  const [token, setToken] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setTokens(await api.tokens.list())
  }, [])

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.tokens.create({ token: token.trim(), label: label.trim() })
      setToken('')
      setLabel('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this token?')) return
    await api.tokens.remove(id)
    await load()
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Add FCM token</h2>
        <p className="muted">
          Store device tokens as plain strings (JSON via the API). Alerts go to
          every enabled token.
        </p>
        <form className="form-row" onSubmit={onCreate}>
          <label className="grow">
            Token
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="FCM registration token"
              required
            />
          </label>
          <label>
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ken phone"
            />
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Tokens</h2>
        {tokens.length === 0 ? (
          <p className="muted">No tokens.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Token</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.label || '—'}</td>
                  <td className="mono truncate">{t.token}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void remove(t.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
