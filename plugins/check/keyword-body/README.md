# `keyword-body` (check plugin)

Fetches the target URL and requires a configured keyword to appear in the response body.

## Usage

### Enable

1. Confirm `keyword-body` is in [`api/plugins.json`](../../../api/plugins.json).
2. Enable **keyword-body** in **Settings → Plugin manager**.

### Configure

**Per-target only** (no global sidecar). Defaults when unset: keyword `ok`, case-insensitive.

| Where | Path |
|-------|------|
| UI | **Checks → Keyword/body check** (`/plugins/check/keyword-body`) and **Targets → keyword-body settings** |
| API | `GET/PUT /api/plugins/check/keyword-body/targets/:targetId/config` |

Fields: `keyword` (string), `caseSensitive` (boolean).

The check performs an HTTP GET to the target URL and searches the response body.

### Targets

- Target must be a full **`http://` or `https://`** URL (same rule as the **http** check).
- Configure keyword per target before the check can succeed with a meaningful needle.

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHECK_TIMEOUT_MS` | `10000` | Fetch timeout (ms) |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/check/keyword-body/targets/:targetId/config` | Per-target config |
| PUT | `/api/plugins/check/keyword-body/targets/:targetId/config` | Save config |

## For developers

```text
plugins/check/keyword-body/
  index.ts    # fetch + body search + evaluateTarget
  config.ts   # DB-backed per-target config
  routes.ts
  ui/
```

- **`evaluateTarget`:** requires `http://` or `https://` URL.
- Config stored in core SQLite (`target_check_configs`), not a sidecar file.
- Good reference for a check with **per-target-only** plugin config.

See also: [Plugin developer guide](../../../docs/plugins.md).
