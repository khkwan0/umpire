# `http` (check plugin)

Requests the target URL over HTTP(S) and fails on unexpected status codes or latency.

## Usage

### Enable

1. Confirm `http` is listed in [`api/plugins.json`](../../../api/plugins.json) (shipped by default).
2. Ensure it is **enabled** in **Settings → Plugin manager** (on by default).

### Configure

**Global defaults** apply to every target unless overridden.

| Where | Path |
|-------|------|
| UI | **Checks → HTTP check** (`/plugins/check/http`) |
| Sidecar | `data/http-check-defaults.json` (next to `DATABASE_PATH`) |
| API | `GET/PUT /api/plugins/check/http/config` |

Fields: HTTP method, headers, body, accepted status ranges (`1xx`–`5xx`), specific status codes, optional max latency (ms). Default accepted range is `2xx` only.

**Per-target override** (optional):

| Where | Path |
|-------|------|
| UI | **Targets** → **HTTP settings** (`/targets/:id/checks/http`) |
| API | `GET/PUT/DELETE /api/plugins/check/http/targets/:targetId/config` |
| Test | `POST /api/plugins/check/http/targets/:targetId/test` |

Enable **Use custom settings for this target** to override globals. **Clear override** removes the custom config.

### Targets

- Target address must be a full **`http://` or `https://`** URL (bare hostnames are not accepted for this check).
- On **Targets**, leave the check box unchecked to run all enabled checks, or tick **http** only.
- Empty `check_ids` on a target means all enabled checks.

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHECK_TIMEOUT_MS` | `10000` | Request timeout (ms) |
| `DATABASE_PATH` | `./data/monitor.sqlite` | Sidecar directory |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/check/http/config` | Global defaults |
| PUT | `/api/plugins/check/http/config` | Save global defaults |
| GET | `/api/plugins/check/http/overrides` | `{ targetIds }` with custom overrides |
| GET | `/api/plugins/check/http/targets/:targetId/config` | Effective + override view |
| PUT | `/api/plugins/check/http/targets/:targetId/config` | Save per-target override |
| DELETE | `/api/plugins/check/http/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/check/http/targets/:targetId/test` | One-shot check with form/effective config |

Preview compatibility before create: `POST /api/targets/evaluate-checks` with `{ url, … }`.

## For developers

```text
plugins/check/http/
  index.ts          # check() + evaluateTarget
  config.ts         # sidecar + DB overrides
  evaluate.ts       # status/latency evaluation
  routes.ts         # HTTP routes + OpenAPI schemas
  ui/               # global defaults page + dashboard widget
```

- **`evaluateTarget`:** requires parseable URL with `http:` or `https:` scheme.
- Per-target overrides live in core SQLite (`target_check_configs`), not the sidecar.
- Reference for configurable checks with global defaults, overrides, test endpoint, and UI.

See also: [Plugin developer guide](../../../docs/plugins.md), [Core guide](../../../docs/core.md).
