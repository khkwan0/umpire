import {
  buildIncidents,
  parseCheckedAt,
  type IncidentSourceRow,
} from './incidents.js'

function row(
  partial: Partial<IncidentSourceRow> &
    Pick<IncidentSourceRow, 'id' | 'ok' | 'checked_at'>,
): IncidentSourceRow {
  return {
    target_id: 1,
    url: 'https://a.test',
    group_tag: 'group_1',
    status_code: null,
    error: null,
    ...partial,
  }
}

describe('parseCheckedAt', () => {
  it('treats SQLite datetime as UTC', () => {
    expect(parseCheckedAt('2026-08-19 12:00:00')).toBe(
      Date.parse('2026-08-19T12:00:00Z'),
    )
  })

  it('accepts ISO timestamps', () => {
    expect(parseCheckedAt('2026-08-19T12:00:00.000Z')).toBe(
      Date.parse('2026-08-19T12:00:00.000Z'),
    )
  })
})

describe('buildIncidents', () => {
  const nowMs = Date.parse('2026-08-19T12:30:00Z')

  it('returns an empty list when there are no failures', () => {
    expect(buildIncidents([], { nowMs })).toEqual([])
    expect(
      buildIncidents(
        [row({ id: 1, ok: 1, checked_at: '2026-08-19 12:00:00' })],
        { nowMs },
      ),
    ).toEqual([])
  })

  it('opens an ongoing outage on the first failure', () => {
    const incidents = buildIncidents(
      [
        row({
          id: 4,
          ok: 0,
          checked_at: '2026-08-19 12:00:00',
          error: 'HTTP 500',
          status_code: 500,
        }),
      ],
      { nowMs },
    )
    expect(incidents).toEqual([
      {
        id: 4,
        target_id: 1,
        url: 'https://a.test',
        group_tag: 'group_1',
        status: 'down',
        recovered: false,
        started_at: '2026-08-19 12:00:00',
        recovered_at: null,
        duration_seconds: 30 * 60,
        error: 'HTTP 500',
        status_code: 500,
      },
    ])
  })

  it('records recovery when the target returns to up', () => {
    const incidents = buildIncidents(
      [
        row({
          id: 1,
          ok: 0,
          checked_at: '2026-08-19 12:00:00',
          error: 'timeout',
        }),
        row({ id: 2, ok: 0, checked_at: '2026-08-19 12:01:00' }),
        row({ id: 3, ok: 1, checked_at: '2026-08-19 12:05:00' }),
      ],
      { nowMs },
    )
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      id: 1,
      recovered: true,
      started_at: '2026-08-19 12:00:00',
      recovered_at: '2026-08-19 12:05:00',
      duration_seconds: 5 * 60,
      error: 'timeout',
    })
  })

  it('treats partial as an outage and keeps the worst status', () => {
    const incidents = buildIncidents(
      [
        row({
          id: 1,
          ok: 2,
          checked_at: '2026-08-19 12:00:00',
          error: '[http] 500',
        }),
        row({ id: 2, ok: 0, checked_at: '2026-08-19 12:01:00' }),
        row({ id: 3, ok: 1, checked_at: '2026-08-19 12:02:00' }),
      ],
      { nowMs },
    )
    expect(incidents[0]).toMatchObject({
      status: 'down',
      recovered: true,
      error: '[http] 500',
    })
  })

  it('splits separate outages after recovery', () => {
    const incidents = buildIncidents(
      [
        row({ id: 1, ok: 0, checked_at: '2026-08-19 12:00:00' }),
        row({ id: 2, ok: 1, checked_at: '2026-08-19 12:05:00' }),
        row({ id: 3, ok: 0, checked_at: '2026-08-19 12:20:00' }),
      ],
      { nowMs },
    )
    expect(incidents).toHaveLength(2)
    expect(incidents[0]).toMatchObject({
      id: 3,
      recovered: false,
      started_at: '2026-08-19 12:20:00',
    })
    expect(incidents[1]).toMatchObject({
      id: 1,
      recovered: true,
      recovered_at: '2026-08-19 12:05:00',
    })
  })

  it('keeps per-target windows and sorts by latest activity', () => {
    const incidents = buildIncidents(
      [
        row({
          id: 1,
          target_id: 1,
          ok: 0,
          checked_at: '2026-08-19 12:00:00',
        }),
        row({
          id: 2,
          target_id: 2,
          url: 'https://b.test',
          group_tag: null,
          ok: 0,
          checked_at: '2026-08-19 12:10:00',
        }),
        row({
          id: 3,
          target_id: 2,
          url: 'https://b.test',
          group_tag: null,
          ok: 1,
          checked_at: '2026-08-19 12:12:00',
        }),
      ],
      { nowMs },
    )
    expect(incidents.map((i) => i.target_id)).toEqual([2, 1])
    expect(incidents[0]).toMatchObject({
      url: 'https://b.test',
      recovered: true,
    })
    expect(incidents[1]).toMatchObject({
      url: 'https://a.test',
      recovered: false,
    })
  })

  it('honors limit after sorting', () => {
    const incidents = buildIncidents(
      [
        row({ id: 1, ok: 0, checked_at: '2026-08-19 12:00:00' }),
        row({ id: 2, ok: 1, checked_at: '2026-08-19 12:01:00' }),
        row({ id: 3, ok: 0, checked_at: '2026-08-19 12:02:00' }),
        row({ id: 4, ok: 1, checked_at: '2026-08-19 12:03:00' }),
      ],
      { limit: 1, nowMs },
    )
    expect(incidents).toHaveLength(1)
    expect(incidents[0]?.id).toBe(3)
  })
})
