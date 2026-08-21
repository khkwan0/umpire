# `tls` (check plugin)

Opens a TLS connection to the target and fails if the handshake or certificate is invalid.

## Usage

### Enable

1. Confirm `tls` is in [`api/plugins.json`](../../../api/plugins.json).
2. Enable **tls** in **Settings → Plugin manager**.

### Configure

No plugin-owned settings. The check uses:

- **`https://host`** or **`https://host:port`** — port from URL (default 443).
- **Bare host or IP** — connects on port **443** (e.g. `example.com`, `10.0.0.5`, `mail.example.com:993`).

Certificate validation uses Node’s default TLS stack (`rejectUnauthorized: true`).

### Targets

| Address form | Compatible |
|--------------|------------|
| `https://example.com` | Yes |
| `example.com` | Yes (port 443) |
| `10.0.0.5:443` | Yes |
| `http://example.com` | No — use **http** check instead |

UI reference: **Checks → TLS check** (`/plugins/check/tls`).

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHECK_TIMEOUT_MS` | `10000` | Connect/handshake timeout (ms) |

## API

This plugin does not register HTTP routes. Enable/disable and target assignment use core APIs only (`/api/targets`, `/api/plugin-manager`, `/api/targets/evaluate-checks`).

## For developers

```text
plugins/check/tls/
  index.ts    # TLS connect + evaluateTarget
  ui/         # help page + dashboard widget (no config API)
```

- **`evaluateTarget`:** valid address required; if a scheme is present it must be `https:` (bare host allowed).
- Minimal check plugin — no sidecar, no `registerRoutes`.

See also: [Plugin developer guide](../../../docs/plugins.md).
