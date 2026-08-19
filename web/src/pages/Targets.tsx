import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  type Group,
  type NotifierStatus,
  type PluginRef,
  type Target,
} from '../api'

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

const MIN_INTERVAL_SECONDS = 5

function IntervalField({
  value,
  ariaLabel,
  onSave,
}: {
  value: number
  ariaLabel: string
  onSave: (next: number) => Promise<void>
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  async function commit() {
    const next = Number(draft)
    if (!Number.isInteger(next) || next < MIN_INTERVAL_SECONDS) {
      setDraft(String(value))
      return
    }
    if (next === value) {
      setDraft(String(value))
      return
    }
    try {
      await onSave(next)
    } catch {
      setDraft(String(value))
    }
  }

  return (
    <label className="interval-edit">
      <input
        className="cell-input"
        type="number"
        min={MIN_INTERVAL_SECONDS}
        step={1}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setDraft(String(value))
            e.currentTarget.blur()
          }
        }}
      />
      <span className="muted">s</span>
    </label>
  )
}

export default function Targets() {
  const [targets, setTargets] = useState<Target[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [checks, setChecks] = useState<PluginRef[]>([])
  const [notifiers, setNotifiers] = useState<NotifierStatus[]>([])
  const [url, setUrl] = useState('https://')
  const [interval, setIntervalSeconds] = useState(60)
  const [groupId, setGroupId] = useState<number | ''>('')
  const [createCheckIds, setCreateCheckIds] = useState<string[]>([])
  const [createNotifierIds, setCreateNotifierIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const childGroups = useMemo(
    () => groups.filter((g) => g.parent !== 0),
    [groups],
  )

  const groupById = useMemo(() => {
    const map = new Map<number, Group>()
    for (const g of groups) map.set(g.id, g)
    return map
  }, [groups])

  const load = useCallback(async () => {
    const [nextTargets, nextGroups, nextChecks, nextNotifiers] =
      await Promise.all([
        api.targets.list(),
        api.groups.list(),
        api.checks.list(),
        api.notifiers.list(),
      ])
    setTargets(nextTargets)
    setGroups(nextGroups)
    setChecks(nextChecks)
    setNotifiers(nextNotifiers)
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
      await api.targets.create({
        url: url.trim(),
        interval_seconds: interval,
        enabled: true,
        group_id: groupId === '' ? null : groupId,
        check_ids: createCheckIds,
        notifier_ids: createNotifierIds,
      })
      setUrl('https://')
      setIntervalSeconds(60)
      setGroupId('')
      setCreateCheckIds([])
      setCreateNotifierIds([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(t: Target) {
    await api.targets.update(t.id, { enabled: !t.enabled })
    await load()
  }

  async function changeInterval(t: Target, next: number) {
    setError(null)
    try {
      await api.targets.update(t.id, { interval_seconds: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  async function changeGroup(t: Target, next: number | null) {
    setError(null)
    try {
      await api.targets.update(t.id, { group_id: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function changeChecks(t: Target, next: string[]) {
    setError(null)
    try {
      await api.targets.update(t.id, { check_ids: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function changeNotifiers(t: Target, next: string[]) {
    setError(null)
    try {
      await api.targets.update(t.id, { notifier_ids: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this target?')) return
    await api.targets.remove(id)
    await load()
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Add target</h2>
        <p className="muted">
          Assign targets to a <strong>child</strong> group (not a root).{' '}
          <Link to="/groups">Manage groups</Link>. Leave checks / notifiers
          unchecked to use <strong>all</strong> loaded plugins of that kind.
        </p>
        <form className="form-row" onSubmit={onCreate}>
          <label className="grow">
            URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
          </label>
          <label>
            Interval (seconds)
            <input
              type="number"
              min={5}
              value={interval}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Group
            <select
              value={groupId === '' ? '' : String(groupId)}
              onChange={(e) =>
                setGroupId(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">Unassigned</option>
              {childGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || `#${g.id}`} ({g.tag})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>
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
                ? 'All loaded checks will run.'
                : `Only: ${createCheckIds.join(', ')}`}
            </p>
          </fieldset>
        )}
        {notifiers.length > 0 && (
          <fieldset className="check-ids">
            <legend>Notifiers (optional allowlist)</legend>
            <div className="check-ids-list">
              {notifiers.map((n) => (
                <label key={n.id} className="check-ids-item">
                  <input
                    type="checkbox"
                    checked={createNotifierIds.includes(n.id)}
                    onChange={() =>
                      setCreateNotifierIds((prev) => toggleId(prev, n.id))
                    }
                  />
                  {n.id}
                  {!n.ready ? ' (not ready)' : ''}
                </label>
              ))}
            </div>
            <p className="muted small">
              {createNotifierIds.length === 0
                ? 'All loaded notifiers will alert.'
                : `Only: ${createNotifierIds.join(', ')}`}
            </p>
          </fieldset>
        )}
        {error && <p className="error">{error}</p>}
        {childGroups.length === 0 && (
          <p className="muted small">
            No child groups yet — create a root and a child on the Groups page
            before assigning.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Configured targets</h2>
        {targets.length === 0 ? (
          <p className="muted">No targets.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Group</th>
                <th>Checks</th>
                <th>Notifiers</th>
                <th>Interval</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const g = t.group_id != null ? groupById.get(t.group_id) : null
                const checkIds = t.check_ids ?? []
                const notifierIds = t.notifier_ids ?? []
                return (
                  <tr key={t.id}>
                    <td className="mono">{t.url}</td>
                    <td>
                      <select
                        value={t.group_id ?? ''}
                        onChange={(e) =>
                          void changeGroup(
                            t,
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      >
                        <option value="">Unassigned</option>
                        {childGroups.map((cg) => (
                          <option key={cg.id} value={cg.id}>
                            {cg.name || `#${cg.id}`} ({cg.tag})
                          </option>
                        ))}
                      </select>
                      {g && <div className="muted small mono">{g.tag}</div>}
                    </td>
                    <td>
                      {checks.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="check-ids-list">
                          {checks.map((c) => (
                            <label key={c.id} className="check-ids-item">
                              <input
                                type="checkbox"
                                checked={checkIds.includes(c.id)}
                                onChange={() =>
                                  void changeChecks(t, toggleId(checkIds, c.id))
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
                    <td>
                      {notifiers.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="check-ids-list">
                          {notifiers.map((n) => (
                            <label key={n.id} className="check-ids-item">
                              <input
                                type="checkbox"
                                checked={notifierIds.includes(n.id)}
                                onChange={() =>
                                  void changeNotifiers(
                                    t,
                                    toggleId(notifierIds, n.id),
                                  )
                                }
                              />
                              {n.id}
                            </label>
                          ))}
                          <div className="muted small">
                            {notifierIds.length === 0
                              ? 'all'
                              : notifierIds.join(', ')}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <IntervalField
                        value={t.interval_seconds}
                        ariaLabel={`Interval in seconds for ${t.url}`}
                        onSave={(next) => changeInterval(t, next)}
                      />
                    </td>
                    <td>{t.enabled ? 'yes' : 'no'}</td>
                    <td>
                      <div className="actions">
                        <button type="button" onClick={() => void toggle(t)}>
                          {t.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void remove(t.id)}
                        >
                          Delete
                        </button>
                      </div>
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
