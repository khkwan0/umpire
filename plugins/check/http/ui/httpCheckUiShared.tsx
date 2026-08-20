import type { FormEvent, ReactNode } from 'react'

export const METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'TRACE',
  'CONNECT',
] as const

export type HttpMethod = (typeof METHODS)[number]
export type StatusRange = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'
export const STATUS_RANGES: StatusRange[] = ['1xx', '2xx', '3xx', '4xx', '5xx']

export interface HttpCheckConfig {
  method: HttpMethod
  headers: Record<string, string>
  body: string
  acceptedStatusRanges: StatusRange[]
  acceptedStatusCodes: number[]
  maxLatencyMs: number | null
}

export interface HttpCheckTargetConfigView {
  useCustom: boolean
  defaults: HttpCheckConfig
  override: HttpCheckConfig | null
  effective: HttpCheckConfig
}

export interface HttpCheckTestResult {
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}

export interface FormValues {
  method: HttpMethod
  headersText: string
  bodyText: string
  acceptedStatusRanges: StatusRange[]
  acceptedStatusCodes: string[]
  maxLatencyMs: string
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await fetch(path, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || res.statusText)
  }
  return body as T
}

function headersToText(headers: Record<string, string>): string {
  const keys = Object.keys(headers)
  if (keys.length === 0) return ''
  return JSON.stringify(headers, null, 2)
}

function parseHeadersText(raw: string): Record<string, string> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('headers must be a JSON object of strings')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new Error('headers values must be strings')
    }
    out[k] = v
  }
  return out
}

export function configToForm(config: HttpCheckConfig): FormValues {
  return {
    method: config.method,
    headersText: headersToText(config.headers),
    bodyText: config.body,
    acceptedStatusRanges: config.acceptedStatusRanges,
    acceptedStatusCodes: config.acceptedStatusCodes.map(String),
    maxLatencyMs:
      config.maxLatencyMs == null ? '' : String(Math.floor(config.maxLatencyMs)),
  }
}

function parseStatusCodesForm(codes: string[]): number[] {
  const out: number[] = []
  for (const raw of codes) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const code = Number(trimmed)
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      throw new Error('Status codes must be integers between 100 and 599')
    }
    out.push(code)
  }
  return Array.from(new Set(out))
}

function hasStatusAcceptance(form: FormValues): boolean {
  return form.acceptedStatusRanges.length > 0 || parseStatusCodesForm(form.acceptedStatusCodes).length > 0
}

export function formToPayload(form: FormValues): HttpCheckConfig {
  const acceptedStatusCodes = parseStatusCodesForm(form.acceptedStatusCodes)
  if (!hasStatusAcceptance(form)) {
    throw new Error('At least one accepted status range or specific status code is required')
  }
  return {
    method: form.method,
    headers: parseHeadersText(form.headersText),
    body: form.bodyText,
    acceptedStatusRanges: form.acceptedStatusRanges,
    acceptedStatusCodes,
    maxLatencyMs: form.maxLatencyMs.trim() ? Number(form.maxLatencyMs) : null,
  }
}

export function HttpCheckFields({
  form,
  onChange,
  disabled = false,
  idPrefix,
}: {
  form: FormValues
  onChange: (next: FormValues) => void
  disabled?: boolean
  idPrefix: string
}) {
  return (
    <>
      <label>
        Method
        <select
          value={form.method}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...form, method: e.target.value as HttpMethod })
          }
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Headers (JSON object, optional)
        <textarea
          value={form.headersText}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, headersText: e.target.value })}
          placeholder='{"Authorization":"Bearer token"}'
          spellCheck={false}
        />
      </label>
      <fieldset className="check-ids">
        <legend>Accepted status ranges</legend>
        <div className="check-ids-list">
          {STATUS_RANGES.map((range) => (
            <label key={`${idPrefix}-${range}`} className="check-ids-item">
              <input
                type="checkbox"
                disabled={disabled}
                checked={form.acceptedStatusRanges.includes(range)}
                onChange={(e) => {
                  onChange({
                    ...form,
                    acceptedStatusRanges: e.target.checked
                      ? [...form.acceptedStatusRanges, range]
                      : form.acceptedStatusRanges.length === 1 &&
                          form.acceptedStatusRanges[0] === range &&
                          parseStatusCodesForm(form.acceptedStatusCodes).length === 0
                        ? form.acceptedStatusRanges
                        : form.acceptedStatusRanges.filter((r) => r !== range),
                  })
                }}
              />
              {range}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="check-ids">
        <legend>Specific status codes (optional)</legend>
        <p className="muted small">
          Accept individual codes in addition to ranges — for example 200 and 204
          without accepting all 2xx.
        </p>
        <div className="status-codes-list">
          {form.acceptedStatusCodes.map((code, index) => (
            <div key={`${idPrefix}-code-${index}`} className="status-code-row">
              <input
                type="number"
                min={100}
                max={599}
                step={1}
                disabled={disabled}
                value={code}
                aria-label={`Status code ${index + 1}`}
                onChange={(e) => {
                  const next = [...form.acceptedStatusCodes]
                  next[index] = e.target.value
                  onChange({ ...form, acceptedStatusCodes: next })
                }}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = form.acceptedStatusCodes.filter((_, i) => i !== index)
                  onChange({ ...form, acceptedStatusCodes: next })
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...form,
              acceptedStatusCodes: [...form.acceptedStatusCodes, ''],
            })
          }
        >
          Add status code
        </button>
      </fieldset>
      <label>
        Max latency (ms, optional)
        <input
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={form.maxLatencyMs}
          onChange={(e) => onChange({ ...form, maxLatencyMs: e.target.value })}
          placeholder="1500"
        />
      </label>
      <label>
        Body (optional)
        <textarea
          value={form.bodyText}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, bodyText: e.target.value })}
          placeholder='{"ping":true}'
          spellCheck={false}
        />
      </label>
    </>
  )
}

export function HttpCheckFootnotes(): ReactNode {
  return (
    <p className="muted small">
      Timeout is controlled by <code>CHECK_TIMEOUT_MS</code> (default 10000 ms).
      Redirects are followed. Default User-Agent is <code>umpire/1.0</code>.
    </p>
  )
}

export function applyTargetConfigView(
  view: HttpCheckTargetConfigView,
  setUseCustom: (v: boolean) => void,
  setDefaultsForm: (v: FormValues) => void,
  setTargetForm: (v: FormValues) => void,
) {
  setUseCustom(view.useCustom)
  setDefaultsForm(configToForm(view.defaults))
  setTargetForm(
    configToForm(view.useCustom ? (view.override ?? view.effective) : view.effective),
  )
}

export async function saveTargetConfig(
  targetId: number,
  useCustom: boolean,
  targetForm: FormValues,
): Promise<HttpCheckTargetConfigView> {
  return request<HttpCheckTargetConfigView>(
    `/api/plugins/check/http/targets/${targetId}/config`,
    {
      method: 'PUT',
      body: JSON.stringify({
        useCustom,
        ...formToPayload(targetForm),
      }),
    },
  )
}

export async function clearTargetOverride(
  targetId: number,
): Promise<HttpCheckTargetConfigView> {
  return request<HttpCheckTargetConfigView>(
    `/api/plugins/check/http/targets/${targetId}/config`,
    { method: 'DELETE' },
  )
}

export async function runTargetTest(
  targetId: number,
  testUrl: string,
  useCustom: boolean,
  targetForm: FormValues,
): Promise<HttpCheckTestResult> {
  return request<HttpCheckTestResult>(
    `/api/plugins/check/http/targets/${targetId}/test`,
    {
      method: 'POST',
      body: JSON.stringify({
        url: testUrl.trim(),
        useCustom,
        ...formToPayload(targetForm),
      }),
    },
  )
}

export async function onSaveDefaultsForm(
  e: FormEvent,
  defaultsForm: FormValues,
  setDefaultsForm: (v: FormValues) => void,
  setMessage: (v: string | null) => void,
  setError: (v: string | null) => void,
  setBusy: (v: boolean) => void,
) {
  e.preventDefault()
  setBusy(true)
  setError(null)
  setMessage(null)
  try {
    const saved = await request<HttpCheckConfig>('/api/plugins/check/http/config', {
      method: 'PUT',
      body: JSON.stringify(formToPayload(defaultsForm)),
    })
    setDefaultsForm(configToForm(saved))
    setMessage('Default parameters saved')
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  } finally {
    setBusy(false)
  }
}
