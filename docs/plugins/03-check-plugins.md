# Chapter 3 — Check plugins

[← Contracts](02-contracts.md) · [Guide index](README.md) · [Next: Notifier plugins →](04-notifier-plugins.md)

Check plugins **probe** a target and return whether it is healthy. Core records the outcome, aggregates across checks, and decides whether to alert.

## Minimum viable check

```typescript
// plugins/check/hello/index.ts
import type { CheckOutcome, CheckPlugin } from '../../../api/src/plugins/types.js'

const helloCheck: CheckPlugin = {
  id: 'hello',
  description: 'Fetches the target URL and passes on HTTP 2xx/3xx.',

  async check(ctx): Promise<CheckOutcome> {
    const startedAt = Date.now()
    try {
      const res = await fetch(ctx.target.url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(5_000),
        headers: { 'user-agent': 'umpire-hello/1.0' },
      })
      const ok = res.status >= 200 && res.status < 400
      return {
        ok,
        statusCode: res.status,
        error: ok ? null : `HTTP ${res.status}`,
        latencyMs: Date.now() - startedAt,
      }
    } catch (err) {
      return {
        ok: false,
        statusCode: null,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      }
    }
  },
}

export default helloCheck
```

Register in `api/plugins.json`:

```json
{
  "checks": ["http", "hello"],
  "scheduler": "interval",
  "notifiers": ["webhook"]
}
```

New check ids default to **enabled** in the plugin manager. Restart the API, create a target, and confirm results in the dashboard.

Optional HTTP route to prove wiring:

```typescript
async registerRoutes(app) {
  app.get('/ping', async () => ({ ok: true, plugin: 'hello', kind: 'check' }))
}
// → GET /api/plugins/check/hello/ping
```

## What happens when `check()` runs

1. Scheduler calls `ctx.run(targetId)`.
2. Core loads the target; skips if disabled.
3. Core intersects: plugin manager enabled ∩ target `check_ids` ∩ `evaluateTarget` compatible.
4. Core calls `check({ target, config })` on each remaining plugin **in parallel**.
5. Core aggregates outcomes → writes `check_results` and `target_state`.
6. Core applies alert policy; may call notifiers.

Your plugin never writes SQLite. Never calls notifiers.

## Target parameter validation (`evaluateTarget`)

Targets store an address in `targets.url` (field name is historical). The value may be a full `http(s)` URL or a bare hostname/IP with optional `:port`.

Implement optional `evaluateTarget` when your probe only works with certain address shapes:

```typescript
import { parseTargetAddress } from '../../../api/src/targetAddress.js'
import type { TargetCompatibility, TargetEvalParams } from '../../../api/src/plugins/types.js'

export function evaluateHttpTarget(params: TargetEvalParams): TargetCompatibility {
  const parsed = parseTargetAddress(params.url)
  if (!parsed || !parsed.hasScheme) {
    return { ok: false, reason: 'requires an http:// or https:// URL' }
  }
  return { ok: true }
}
```

| Return | Meaning |
|--------|---------|
| `{ ok: true }` | Check may run for these params |
| `{ ok: false, reason }` | Incompatible — shown in UI, skipped at run time |
| Hook omitted | Always compatible |

Core uses this in three places:

1. **Draft UI** — `POST /api/targets/evaluate-checks` grays out incompatible checkboxes.
2. **Save** — non-empty `check_ids` including an incompatible id → **400**.
3. **Pipeline** — incompatible checks are dropped before `check()` runs.

Helpers: [`api/src/checkCompatibility.ts`](../../api/src/checkCompatibility.ts), [`api/src/targetAddress.ts`](../../api/src/targetAddress.ts).

### Shipped check rules (reference)

| Plugin | Compatible when |
|--------|-----------------|
| `http`, `keyword-body` | Address parses with `http://` or `https://` scheme |
| `tls` | Address parses; not explicit `http://` (TLS on 443 by default) |
| `ping`, `tcp` | Address parses as URL or bare host/IP |

## Example: minimal check (ping)

Shipped [`plugins/check/ping/index.ts`](../../plugins/check/ping/index.ts) — single file, no routes, no config:

- `evaluateTarget` validates address via `parseTargetAddress`
- `check()` runs system `ping`, parses latency from stdout
- Returns `statusCode: null` (ICMP has no HTTP status)

This is the template when your probe needs only `ctx.target.url`.

## Example: configurable check (HTTP)

Shipped [`plugins/check/http/`](../../plugins/check/http/) — the full-stack check pattern:

```text
plugins/check/http/
  index.ts       # evaluateTarget + check() + registerRoutes
  config.ts      # sidecar data/http-check.json + per-target overrides
  evaluate.ts    # probe logic separated from plugin shell
  routes.ts      # GET/PUT /config, per-target CRUD, test
  ui/            # settings page + dashboard widget
```

Key pattern in `index.ts`:

```typescript
async check(ctx: CheckContext): Promise<CheckOutcome> {
  const config = resolveHttpCheckConfigForTarget(ctx.config)
  return runHttpCheck(ctx.target.url, config)
}
```

Config layers:

- **Global defaults** in sidecar JSON (method, headers, accepted status ranges, latency threshold)
- **Per-target override** in `target_check_configs` (via `GET/PUT /targets/:targetId/config`)
- **`effective`** = override if `useCustom`, else defaults

When your check needs operator-configurable settings beyond `url`, copy this layout.

## Example: per-target-only config (keyword-body)

Shipped [`plugins/check/keyword-body/`](../../plugins/check/keyword-body/) — no global sidecar:

- Config lives only in `target_check_configs` per target
- Routes: `GET/PUT/DELETE /targets/:targetId/config`
- `check()` reads `ctx.config` for `{ keyword, caseSensitive }`

```typescript
async check(ctx: CheckContext): Promise<CheckOutcome> {
  const cfg = resolveKeywordBodyConfig(ctx.config)
  // fetch url, search body for cfg.keyword
}
```

Use this when every target needs different settings and global defaults do not make sense.

## Example: TLS certificate expiry

Shipped [`plugins/check/tls/`](../../plugins/check/tls/) — Node `tls` module, env-tunable threshold:

- Opens TLS connection to hostname/port derived from target URL
- Fails if certificate expires within N days (`TLS_WARN_DAYS`, default 14)
- Runs alongside `http` so a target can be `partial` (site up, cert expiring)

No `registerRoutes` — threshold via env is acceptable for a simple global default; prefer sidecar + UI for operator-facing settings.

## Per-target check config API

When you need settings per target, expose routes like:

| Route | Purpose |
|-------|---------|
| `GET /targets/:targetId/config` | Read `{ useCustom, defaults, override, effective }` |
| `PUT /targets/:targetId/config` | Set override |
| `DELETE /targets/:targetId/config` | Clear override |
| `POST /targets/:targetId/test` | Run probe without waiting for scheduler |
| `GET /overrides` | List target ids with overrides |

Core stores the JSON blob; your plugin validates shape on read/write.

## Testing check plugins

| Approach | Example |
|----------|---------|
| Config parse/validate unit tests | [`plugins/check/http/config.test.ts`](../../plugins/check/http/config.test.ts) |
| `evaluateTarget` tests | [`plugins/check/http/index.test.ts`](../../plugins/check/http/index.test.ts) |
| Pipeline integration (mock plugins) | [`api/src/pipeline.test.ts`](../../api/src/pipeline.test.ts) |

Test `check()` with mocked `fetch` or stubbed network calls. Test that failed probes return `ok: false`, not thrown errors.

## Check plugin checklist

- [ ] `id` matches folder and `plugins.json`
- [ ] `check()` always returns complete `CheckOutcome`
- [ ] Failed probes return `ok: false`, never throw
- [ ] `evaluateTarget` if address shape matters
- [ ] `registerRoutes` + UI if operators configure settings
- [ ] Fastify `schema` on routes for Swagger
- [ ] Enabled in plugin manager (checks default on)
