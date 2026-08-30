# Chapter 7 — Registration & testing

[← HTTP routes & UI](06-routes-and-ui.md) · [Guide index](README.md)

## Registration workflow

1. Create `plugins/<kind>/<id>/index.ts` exporting `default` (or `plugin`).
2. If you need npm packages: `cd api && npm install <pkg>`.
3. Edit [`api/plugins.json`](../../api/plugins.json):
   - **Check:** append to `"checks"` array
   - **Notifier:** append to `"notifiers"` array
   - **Scheduler:** set `"scheduler"` to your id (**replaces** the current scheduler)
4. Optional: `routes.ts`, `config.ts`, `ui/index.tsx`.
5. Restart API. Rebuild **web** if you added UI.
6. **Enable** in **Settings → Plugin manager** (required for new notifiers).

### Environment overrides

| Variable | Purpose |
|----------|---------|
| `PLUGINS_CONFIG` | Path to load list JSON (default: `api/plugins.json`) |
| `PLUGINS_ROOT` | Directory containing `check/`, `notify/`, `scheduler/` (default: repo `plugins/`) |

## Load list vs runtime enable

| File | Purpose |
|------|---------|
| [`api/plugins.json`](../../api/plugins.json) | Which plugins **load** at startup |
| [`data/plugin-manager.json`](../../data/plugin-manager.json) | Which loaded plugins are **enabled** |

A plugin can be loaded but disabled — it appears in `GET /api/plugins` but does not run in the pipeline.

### Default enable flags

From [`api/src/plugins/manager.ts`](../../api/src/plugins/manager.ts):

| Kind | Default |
|------|---------|
| Check | Enabled unless explicitly `false` |
| Notifier | Disabled except `webhook` |
| Scheduler | Enabled |

Disabling the scheduler via API calls `stop()`. Enabling calls `start()` + `reschedule()`.

## Plugin manager HTTP API

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/api/plugin-manager` | — | Enable state + `ready` for notifiers |
| PUT | `/api/plugin-manager/:kind/:id` | `{ enabled: boolean }` | Toggle — kind ∈ `check`, `notify`, `scheduler` |
| GET | `/api/plugins` | — | Loaded plugins + mounted routes |

Implementation: [`api/src/routes/plugin-manager.ts`](../../api/src/routes/plugin-manager.ts).

## Verify checklist

After enabling a plugin:

1. **API log** — `[plugins] check=…` / `notifier=… ready=…` / `scheduler=…`
2. **`GET /api/status`** — includes the id; `notifiers[].ready` for notifiers
3. **`GET /api/plugins`** — includes id and any routes
4. **Swagger** — `/documentation` lists routes with `schema`
5. **Web nav** — plugin page appears (check → Checks dropdown; notify → Notifiers; scheduler → top-level)
6. **Dashboard widget** — if UI exports `Dashboard`, panel appears on `/`
7. **Target form** — new check/notifier id in checkboxes
8. **`evaluateTarget`** — `POST /api/targets/evaluate-checks` shows `compatible` / `reason`
9. **End-to-end** — fire a test alert (notifiers) or wait for scheduler tick (checks)

## Testing patterns

### Config unit tests

Use a temp directory and set `DATABASE_PATH` so sidecar paths resolve correctly:

```typescript
// plugins/check/http/config.test.ts pattern
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'umpire-test-'))
process.env.DATABASE_PATH = join(dir, 'umpire.db')
// write sidecar, call readDefaults(), assert shape
```

Pure parse/validate tests need no running server: [`plugins/notify/webhook/config.test.ts`](../../plugins/notify/webhook/config.test.ts).

### Scheduler tests with fake timers

```typescript
// plugins/scheduler/interval/index.test.ts pattern
import { vi } from 'vitest'

vi.useFakeTimers()
const run = vi.fn()
plugin.init({ getTargets: () => [{ id: 1, intervalSeconds: 60, enabled: true }], run })
plugin.start()
await vi.advanceTimersByTimeAsync(2000)
expect(run).toHaveBeenCalledWith(1)
```

### Pipeline integration

[`api/src/pipeline.test.ts`](../../api/src/pipeline.test.ts) uses runtime setters to inject mock plugins without loading real files.

### Send/delivery tests

Mock `fetch` or Firebase SDK: [`plugins/notify/fcm/send.test.ts`](../../plugins/notify/fcm/send.test.ts), [`plugins/notify/webhook/send.test.ts`](../../plugins/notify/webhook/send.test.ts).

### Check evaluation tests

Test `evaluateTarget` and `check()` separately: [`plugins/check/http/index.test.ts`](../../plugins/check/http/index.test.ts).

## Docker notes

Both `api` and `web` Docker images copy `plugins/` and must be built from the **repo root**:

- [`api/Dockerfile`](../../api/Dockerfile)
- [`web/Dockerfile`](../../web/Dockerfile)

Rebuild both after adding plugin code or UI.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Plugin not in logs at startup | Missing from `plugins.json` or file not found |
| Startup crash | Type guard failed — missing required method |
| Loaded but never runs | Disabled in plugin manager (common for notifiers) |
| UI page missing | No `ui/index.tsx`, plugin disabled, or web not rebuilt |
| Route 404 | Wrong path — remember `/api/plugins/<kind>/<id>/` prefix |
| Check never runs | Incompatible address (`evaluateTarget`) or not in target allowlist |
| Notifier never fires | Disabled, not in target `notifier_ids`, or core `check_ids` filter blocked it |
| Duplicate route error | Two handlers registered on same method+path in one plugin |

## Further reading

- [Framework overview](01-framework.md) — pipeline and lifecycle
- [Contracts reference](02-contracts.md) — hard vs soft rules
- [Core developer guide](../core.md) — host internals, frozen schema
- [Shipped plugin READMEs](../../plugins/README.md) — per-plugin usage and notes
