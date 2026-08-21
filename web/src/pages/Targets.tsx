import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {
  api,
  isTransientApiError,
  type CheckCompatibility,
  type Group,
  type NotifierStatus,
  type PluginManagerState,
  type PluginRef,
  type Target,
} from '../api'
import ReconnectBanner from '../ReconnectBanner'
import {useRealtimeRefresh} from '../realtime'

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

const MIN_INTERVAL_SECONDS = 5

function compatibilityMap(
  rows: CheckCompatibility[],
): Map<string, CheckCompatibility> {
  return new Map(rows.map(row => [row.id, row]))
}

function isCheckCompatible(
  map: Map<string, CheckCompatibility> | undefined,
  checkId: string,
): boolean {
  const row = map?.get(checkId)
  return row ? row.compatible : true
}

function checkIncompatibleReason(
  map: Map<string, CheckCompatibility> | undefined,
  checkId: string,
): string | null {
  const row = map?.get(checkId)
  if (!row || row.compatible) return null
  return row.reason
}

function targetUsesHttpCheck(
  t: Target,
  httpEnabled: boolean,
  compat?: Map<string, CheckCompatibility>,
): boolean {
  if (!httpEnabled) return false
  if (!isCheckCompatible(compat, 'http')) return false
  const checkIds = t.check_ids ?? []
  return checkIds.length === 0 || checkIds.includes('http')
}

function targetUsesNotifier(
  t: Target,
  notifierId: string,
  enabled: boolean,
): boolean {
  if (!enabled) return false
  const ids = t.notifier_ids ?? []
  return ids.length === 0 || ids.includes(notifierId)
}

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
        onChange={e => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={e => {
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
  const [pluginManager, setPluginManager] = useState<PluginManagerState | null>(
    null,
  )
  const [httpCustomTargetIds, setHttpCustomTargetIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [notifierCustomTargetIds, setNotifierCustomTargetIds] = useState<
    Map<string, Set<number>>
  >(() => new Map())
  const [url, setUrl] = useState('')

  const [interval, setIntervalSeconds] = useState(60)
  const [groupId, setGroupId] = useState<number | ''>('')
  const [createCheckIds, setCreateCheckIds] = useState<string[]>([])
  const [createNotifierIds, setCreateNotifierIds] = useState<string[]>([])
  const [createCompat, setCreateCompat] = useState<
    Map<string, CheckCompatibility>
  >(() => new Map())
  const [rowCompat, setRowCompat] = useState<
    Map<number, Map<string, CheckCompatibility>>
  >(() => new Map())
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [busy, setBusy] = useState(false)

  const childGroups = useMemo(
    () => groups.filter(g => g.parent !== 0),
    [groups],
  )

  const groupById = useMemo(() => {
    const map = new Map<number, Group>()
    for (const g of groups) map.set(g.id, g)
    return map
  }, [groups])

  const load = useCallback(async () => {
    try {
      const [nextTargets, nextGroups, nextChecks, nextNotifiers, nextManager] =
        await Promise.all([
          api.targets.list(),
          api.groups.list(),
          api.checks.list(),
          api.notifiers.list(),
          api.pluginManager.get(),
        ])
      const [nextHttpOverrides, checkIdOverrides] = await Promise.all([
        api.targets.httpCheck.listOverrides().catch(() => ({targetIds: []})),
        api.targets.notifier.listCheckIds().catch(() => ({items: []})),
      ])
      setTargets(nextTargets)
      setGroups(nextGroups)
      setChecks(nextChecks)
      setNotifiers(nextNotifiers)
      setPluginManager(nextManager)
      setHttpCustomTargetIds(new Set(nextHttpOverrides.targetIds))
      const customMap = new Map<string, Set<number>>()
      for (const item of checkIdOverrides.items) {
        customMap.set(item.notifierId, new Set(item.targetIds))
      }
      setNotifierCustomTargetIds(customMap)

      const compatEntries = await Promise.all(
        nextTargets.map(async t => {
          try {
            const res = await api.targets.evaluateChecks({
              url: t.url,
              interval_seconds: t.interval_seconds,
              group_id: t.group_id,
            })
            return [t.id, compatibilityMap(res.checks)] as const
          } catch {
            return [t.id, new Map<string, CheckCompatibility>()] as const
          }
        }),
      )
      setRowCompat(new Map(compatEntries))

      setError(null)
      setReconnecting(false)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setReconnecting(false)
    }
  }, [])

  const enabledCheckIds = useMemo(() => {
    const entries = pluginManager?.checks ?? []
    return new Set(entries.filter(p => p.enabled).map(p => p.id))
  }, [pluginManager])

  const enabledNotifierIds = useMemo(() => {
    const entries = pluginManager?.notifiers ?? []
    return new Set(entries.filter(p => p.enabled).map(p => p.id))
  }, [pluginManager])

  const visibleChecks = useMemo(
    () => checks.filter(c => enabledCheckIds.has(c.id)),
    [checks, enabledCheckIds],
  )

  const visibleNotifiers = useMemo(
    () => notifiers.filter(n => enabledNotifierIds.has(n.id)),
    [notifiers, enabledNotifierIds],
  )

  const createCompatibleIds = useMemo(
    () =>
      visibleChecks
        .filter(c => isCheckCompatible(createCompat, c.id))
        .map(c => c.id),
    [visibleChecks, createCompat],
  )

  useEffect(() => {
    void load()
  }, [load])

  useRealtimeRefresh(load)

  useEffect(() => {
    const trimmed = url.trim()
    if (!trimmed) {
      setCreateCompat(new Map())
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.targets
        .evaluateChecks({
          url: trimmed,
          interval_seconds: interval,
          group_id: groupId === '' ? null : groupId,
        })
        .then(res => {
          if (cancelled) return
          const next = compatibilityMap(res.checks)
          setCreateCompat(next)
          setCreateCheckIds(prev =>
            prev.filter(id => isCheckCompatible(next, id)),
          )
        })
        .catch(() => {
          if (!cancelled) setCreateCompat(new Map())
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [url, interval, groupId])

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
        check_ids: createCheckIds.filter(id =>
          isCheckCompatible(createCompat, id),
        ),
        notifier_ids: createNotifierIds,
      })
      setUrl('')
      setIntervalSeconds(60)
      setGroupId('')
      setCreateCheckIds([])
      setCreateNotifierIds([])
      setCreateCompat(new Map())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(t: Target) {
    await api.targets.update(t.id, {enabled: !t.enabled})
    await load()
  }

  async function changeInterval(t: Target, next: number) {
    setError(null)
    try {
      await api.targets.update(t.id, {interval_seconds: next})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  async function changeGroup(t: Target, next: number | null) {
    setError(null)
    try {
      await api.targets.update(t.id, {group_id: next})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function changeChecks(t: Target, next: string[]) {
    setError(null)
    try {
      await api.targets.update(t.id, {check_ids: next})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function changeNotifiers(t: Target, next: string[]) {
    setError(null)
    try {
      await api.targets.update(t.id, {notifier_ids: next})
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
      {reconnecting && <ReconnectBanner />}
      <section className="panel" data-onboarding="add-target">
        <h2>Add target</h2>
        <p className="muted">
          Assign targets to a <strong>child</strong> group (not a root).{' '}
          <Link to="/groups">Manage groups</Link>.
        </p>
        <form className="form-row" onSubmit={onCreate}>
          <label className="grow">
            Address
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="example.com, 10.0.0.5, or https://example.com/health"
              required
            />
          </label>
          <label>
            Interval (seconds)
            <input
              type="number"
              min={5}
              value={interval}
              onChange={e => setIntervalSeconds(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Group
            <select
              value={groupId === '' ? '' : String(groupId)}
              onChange={e =>
                setGroupId(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">Unassigned</option>
              {childGroups.map(g => (
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
        <p className="muted small">
          Hostname or IP is enough for ping/TCP (e.g. <code>example.com</code>,{' '}
          <code>10.0.0.5</code>). HTTP and keyword checks need a full{' '}
          <code>http://</code> or <code>https://</code> URL.
        </p>
        {visibleChecks.length > 0 && (
          <fieldset className="check-ids">
            <legend>Checks</legend>
            <p className="muted small">
              {createCheckIds.length === 0 ? (
                <>
                  <strong>
                    Nothing selected — every compatible loaded check will run
                  </strong>
                  {createCompatibleIds.length > 0
                    ? ` (${createCompatibleIds.join(', ')})`
                    : url.trim()
                      ? ' (none are compatible with this address yet)'
                      : ''}
                  . Select one or more boxes below only if you want to limit
                  which checks run. Incompatible checks stay disabled.
                </>
              ) : (
                <>
                  Only the selected checks will run:{' '}
                  <strong>{createCheckIds.join(', ')}</strong>
                </>
              )}
            </p>
            <div className="check-ids-list">
              {visibleChecks.map(c => {
                const compatible = isCheckCompatible(createCompat, c.id)
                const reason = checkIncompatibleReason(createCompat, c.id)
                return (
                  <label
                    key={c.id}
                    className={
                      compatible
                        ? 'check-ids-item'
                        : 'check-ids-item incompatible'
                    }
                    title={reason ?? undefined}
                  >
                    <input
                      type="checkbox"
                      checked={createCheckIds.includes(c.id)}
                      disabled={!compatible}
                      onChange={() =>
                        setCreateCheckIds(prev => toggleId(prev, c.id))
                      }
                    />
                    <span>
                      {c.id}
                      {!compatible && reason ? (
                        <span className="check-incompat-reason">
                          {' '}
                          — {reason}
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}
        {visibleNotifiers.length > 0 && (
          <fieldset className="check-ids">
            <legend>Notifiers</legend>
            <p className="muted small">
              {createNotifierIds.length === 0 ? (
                <>
                  <strong>
                    Nothing selected — every loaded notifier will alert
                  </strong>{' '}
                  for this target. Select one or more boxes below only if you
                  want to limit which notifiers fire.
                </>
              ) : (
                <>
                  Only the selected notifiers will alert:{' '}
                  <strong>{createNotifierIds.join(', ')}</strong>
                </>
              )}
            </p>
            <div className="check-ids-list">
              {visibleNotifiers.map(n => (
                <label key={n.id} className="check-ids-item">
                  <input
                    type="checkbox"
                    checked={createNotifierIds.includes(n.id)}
                    onChange={() =>
                      setCreateNotifierIds(prev => toggleId(prev, n.id))
                    }
                  />
                  {n.id}
                  {!n.ready ? ' (not ready)' : ''}
                </label>
              ))}
            </div>
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
                <th>Address</th>
                <th>Group</th>
                <th>Checks</th>
                <th>Notifiers</th>
                <th>Interval</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {targets.map(t => {
                const g = t.group_id != null ? groupById.get(t.group_id) : null
                const checkIds = t.check_ids ?? []
                const notifierIds = t.notifier_ids ?? []
                const compat = rowCompat.get(t.id)
                return (
                  <tr key={t.id}>
                    <td className="mono">{t.url}</td>
                    <td>
                      <select
                        value={t.group_id ?? ''}
                        onChange={e =>
                          void changeGroup(
                            t,
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      >
                        <option value="">Unassigned</option>
                        {childGroups.map(cg => (
                          <option key={cg.id} value={cg.id}>
                            {cg.name || `#${cg.id}`} ({cg.tag})
                          </option>
                        ))}
                      </select>
                      {g && <div className="muted small mono">{g.tag}</div>}
                    </td>
                    <td>
                      {visibleChecks.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="check-ids-list">
                          {visibleChecks.map(c => {
                            const compatible = isCheckCompatible(compat, c.id)
                            const reason = checkIncompatibleReason(
                              compat,
                              c.id,
                            )
                            return (
                              <label
                                key={c.id}
                                className={
                                  compatible
                                    ? 'check-ids-item'
                                    : 'check-ids-item incompatible'
                                }
                                title={reason ?? undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    compatible && checkIds.includes(c.id)
                                  }
                                  disabled={!compatible}
                                  onChange={() =>
                                    void changeChecks(
                                      t,
                                      toggleId(checkIds, c.id).filter(id =>
                                        isCheckCompatible(compat, id),
                                      ),
                                    )
                                  }
                                />
                                <span>
                                  {c.id}
                                  {!compatible && reason ? (
                                    <span className="check-incompat-reason">
                                      {' '}
                                      — {reason}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            )
                          })}
                          <div className="muted small">
                            {checkIds.length === 0
                              ? 'all compatible'
                              : checkIds
                                  .filter(id => isCheckCompatible(compat, id))
                                  .join(', ') || 'none compatible'}
                          </div>
                          {targetUsesHttpCheck(
                            t,
                            enabledCheckIds.has('http'),
                            compat,
                          ) && (
                            <Link
                              className={
                                httpCustomTargetIds.has(t.id)
                                  ? 'http-settings-link custom'
                                  : 'http-settings-link'
                              }
                              to={`/targets/${t.id}/checks/http`}
                              title={
                                httpCustomTargetIds.has(t.id)
                                  ? 'This target uses custom HTTP check parameters'
                                  : 'HTTP check settings for this target'
                              }
                            >
                              HTTP settings
                              {httpCustomTargetIds.has(t.id) && (
                                <span className="pill pending">custom</span>
                              )}
                            </Link>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {visibleNotifiers.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="check-ids-list">
                          {visibleNotifiers.map(n => (
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
                          {visibleNotifiers.map(n =>
                            targetUsesNotifier(
                              t,
                              n.id,
                              enabledNotifierIds.has(n.id),
                            ) ? (
                              <Link
                                key={`${t.id}-${n.id}-settings`}
                                className={
                                  notifierCustomTargetIds.get(n.id)?.has(t.id)
                                    ? 'http-settings-link custom'
                                    : 'http-settings-link'
                                }
                                to={`/targets/${t.id}/notifiers/${n.id}`}
                                title={
                                  notifierCustomTargetIds.get(n.id)?.has(t.id)
                                    ? `This target uses custom ${n.id} notifier settings`
                                    : `${n.id} notifier settings for this target`
                                }
                              >
                                {n.id} settings
                                {notifierCustomTargetIds
                                  .get(n.id)
                                  ?.has(t.id) && (
                                  <span className="pill pending">custom</span>
                                )}
                              </Link>
                            ) : null,
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <IntervalField
                        value={t.interval_seconds}
                        ariaLabel={`Interval in seconds for ${t.url}`}
                        onSave={next => changeInterval(t, next)}
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
