# `tcp` (check plugin)

Opens a TCP connection to the target host and port (URL, hostname, or IP).

## Usage

### Enable

1. Confirm `tcp` is in [`api/plugins.json`](../../../api/plugins.json).
2. Enable **tcp** in **Settings → Plugin manager**.

### Configure

No plugin-owned settings. Port selection:

| Target form | Port used |
|-------------|-----------|
| `https://host:8443/path` | From URL (`8443`) |
| `http://host/path` | From URL (default 80) |
| Bare `host` or `host:port` | Explicit port or **80** |

Success means the TCP handshake completed within the timeout.

### Targets

Works with **bare hostnames, IPs, and URLs** — any address core accepts as a valid target.

Examples: `db.internal`, `10.0.0.5`, `10.0.0.5:5432`, `https://api.example.com:443`.

UI reference: **Checks → TCP check** (`/plugins/check/tcp`).

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHECK_TIMEOUT_MS` | `10000` | Connect timeout (ms) |

## API

No plugin HTTP routes. Use core `/api/targets` and `/api/targets/evaluate-checks`.

## For developers

```text
plugins/check/tcp/
  index.ts    # net.connect + evaluateTarget
  ui/         # help page + dashboard widget
```

- **`evaluateTarget`:** any valid target address.
- Use when you need reachability without HTTP semantics.

See also: [Plugin developer guide](../../../docs/plugins.md).
