import {useCallback, useEffect, useState, type FormEvent} from 'react'
import {api, type ApiToken, type User} from '@umpire/web-api'
import {FormattedTimestamp} from '@umpire/web-formatted-timestamp'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
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
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  async function createToken(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    setNewToken(null)
    setCopied(false)
    try {
      const created = await api.apiTokens.create({
        label: label.trim() || undefined,
        expires_in_days: expiresInDays === '' ? null : Number(expiresInDays),
      })
      setNewToken(created.token)
      setLabel('')
      setExpiresInDays('')
      setMessage('Token created — copy it now; it will not be shown again.')
      await loadTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function revokeToken(id: number, tokenLabel: string) {
    if (
      !window.confirm(
        `Revoke token "${tokenLabel}"? Applications using it will lose access.`,
      )
    ) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      await api.apiTokens.remove(id)
      setMessage('Token revoked')
      if (newToken) setNewToken(null)
      await loadTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onCopyNewToken() {
    if (!newToken) return
    const ok = await copyText(newToken)
    setCopied(ok)
    if (ok) {
      setMessage('Token copied to clipboard')
    } else {
      setError('Could not copy — select the token and copy manually')
    }
  }

  if (!signedIn) {
    return (
      <section className="panel">
        <h2>API tokens</h2>
        <p className="muted small">
          Bearer tokens for the MCP server, agent CLI, and other automation.
          Sign in with a user account to create and manage tokens.
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>API tokens</h2>
      <p className="muted small">
        Create Bearer tokens for MCP clients, the agent CLI, and scripts. Use{' '}
        <code>Authorization: Bearer umpire_…</code> on API requests. Tokens
        inherit your role and plugin permissions.
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p className="ok-text">{message}</p>}

      {newToken && (
        <div className="api-token-reveal">
          <p className="small">
            <strong>New token</strong> — shown once. Store it securely.
          </p>
          <code className="api-token-secret">{newToken}</code>
          <div className="api-token-reveal-actions">
            <button type="button" onClick={() => void onCopyNewToken()}>
              {copied ? 'Copied' : 'Copy token'}
            </button>
            <button
              type="button"
              className="muted"
              onClick={() => setNewToken(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form className="form-col api-token-create" onSubmit={createToken}>
        <label>
          Label
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Claude Desktop, CI monitor"
          />
        </label>
        <label>
          Expires in days
          <input
            type="number"
            min={1}
            max={3650}
            value={expiresInDays}
            placeholder="Optional — leave empty for no expiry"
            onChange={e =>
              setExpiresInDays(
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
          />
        </label>
        <button type="submit" disabled={busy}>
          Create token
        </button>
      </form>

      {loading ? (
        <p className="muted small">Loading tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="muted small">No tokens yet.</p>
      ) : (
        <table className="api-tokens-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Prefix</th>
              {isAdmin && <th>User</th>}
              <th>Created</th>
              <th>Expires</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map(token => (
              <tr key={token.id}>
                <td>{token.label}</td>
                <td>
                  <code>{token.token_prefix}…</code>
                </td>
                {isAdmin && <td>{usernameFor(token.user_id)}</td>}
                <td>
                  <FormattedTimestamp value={token.created_at} />
                </td>
                <td>
                  <FormattedTimestamp
                    value={token.expires_at}
                    fallback="Never"
                  />
                </td>
                <td>
                  <FormattedTimestamp
                    value={token.last_used_at}
                    fallback="Never"
                  />
                </td>
                <td className="actions">
                  <button
                    type="button"
                    onClick={() => void revokeToken(token.id, token.label)}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
