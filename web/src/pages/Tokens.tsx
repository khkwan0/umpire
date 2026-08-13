import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  api,
  type FcmToken,
  type PluginRef,
  type Target,
} from '../api'

function toggleId<T extends string | number>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export default function Tokens() {
  const [tokens, setTokens] = useState<FcmToken[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [checks, setChecks] = useState<PluginRef[]>([])
  const [token, setToken] = useState('')
  const [label, setLabel] = useState('')
  const [createTargetIds, setCreateTargetIds] = useState<number[]>([])
  const [createCheckIds, setCreateCheckIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [nextTokens, nextTargets, nextChecks] = await Promise.all([
      api.tokens.list(),
      api.targets.list(),
      api.checks.list(),
    ])
    setTokens(nextTokens)
    setTargets(nextTargets)
    setChecks(nextChecks)
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
      await api.tokens.create({
        token: token.trim(),
        label: label.trim(),
        target_ids: createTargetIds,
        check_ids: createCheckIds,
      })
      setToken('')
      setLabel('')
      setCreateTargetIds([])
      setCreateCheckIds([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function changeTargets(t: FcmToken, next: number[]) {
    setError(null)
    try {
      await api.tokens.update(t.id, { target_ids: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function changeChecks(t: FcmToken, next: string[]) {
    setError(null)
    try {
      await api.tokens.update(t.id, { check_ids: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function toggleEnabled(t: FcmToken) {
    setError(null)
    try {
      await api.tokens.update(t.id, { enabled: !t.enabled })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
          Owned by the <strong>fcm</strong> notifier. Leave targets / checks
          unchecked to receive <strong>all</strong> matching alerts. Other
          notifiers (e.g. webhook) use their own config.
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
        {targets.length > 0 && (
          <fieldset className="check-ids">
            <legend>Targets (optional allowlist)</legend>
            <div className="check-ids-list">
              {targets.map((tg) => (
                <label key={tg.id} className="check-ids-item">
                  <input
                    type="checkbox"
                    checked={createTargetIds.includes(tg.id)}
                    onChange={() =>
                      setCreateTargetIds((prev) => toggleId(prev, tg.id))
                    }
                  />
                  <span className="mono">#{tg.id}</span> {tg.url}
                </label>
              ))}
            </div>
            <p className="muted small">
              {createTargetIds.length === 0
                ? 'All targets.'
                : `Only: ${createTargetIds.join(', ')}`}
            </p>
          </fieldset>
        )}
        {checks.length > 0 && (
          <fieldset className="check-ids">
            <legend>Checks (optional allowlist)</legend>
            <div className="check-ids-list">
              {checks.map((c) => (
                <label key={c.id} className="check-ids-item">
                  <input
                    type="checkbox"
                    checked={createCheckIds.includes(c.id)}
                    onChange={() =>
                      setCreateCheckIds((prev) => toggleId(prev, c.id))
                    }
                  />
                  {c.id}
                </label>
              ))}
            </div>
            <p className="muted small">
              {createCheckIds.length === 0
                ? 'Any alert (including recovery).'
                : `Only failures of: ${createCheckIds.join(', ')} (no recovery)`}
            </p>
          </fieldset>
        )}
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
                <th>Targets</th>
                <th>Checks</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                const targetIds = t.target_ids ?? []
                const checkIds = t.check_ids ?? []
                return (
                  <tr key={t.id}>
                    <td>{t.label || '—'}</td>
                    <td className="mono truncate">{t.token}</td>
                    <td>
                      {targets.length === 0 ? (
                        <span className="muted">all</span>
                      ) : (
                        <div className="check-ids-list">
                          {targets.map((tg) => (
                            <label key={tg.id} className="check-ids-item">
                              <input
                                type="checkbox"
                                checked={targetIds.includes(tg.id)}
                                onChange={() =>
                                  void changeTargets(
                                    t,
                                    toggleId(targetIds, tg.id),
                                  )
                                }
                              />
                              #{tg.id}
                            </label>
                          ))}
                          <div className="muted small">
                            {targetIds.length === 0
                              ? 'all'
                              : targetIds.join(', ')}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {checks.length === 0 ? (
                        <span className="muted">all</span>
                      ) : (
                        <div className="check-ids-list">
                          {checks.map((c) => (
                            <label key={c.id} className="check-ids-item">
                              <input
                                type="checkbox"
                                checked={checkIds.includes(c.id)}
                                onChange={() =>
                                  void changeChecks(
                                    t,
                                    toggleId(checkIds, c.id),
                                  )
                                }
                              />
                              {c.id}
                            </label>
                          ))}
                          <div className="muted small">
                            {checkIds.length === 0
                              ? 'all'
                              : checkIds.join(', ')}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>{t.enabled ? 'yes' : 'no'}</td>
                    <td className="actions">
                      <button
                        type="button"
                        onClick={() => void toggleEnabled(t)}
                      >
                        {t.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void remove(t.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
