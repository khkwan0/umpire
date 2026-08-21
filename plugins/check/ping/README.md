# `ping` (check plugin)

ICMP-pings the target hostname or IP and reports round-trip time.

## Usage

### Enable

1. Confirm `ping` is in [`api/plugins.json`](../../../api/plugins.json).
2. Enable **ping** in **Settings → Plugin manager**.

### Configure

No plugin-owned settings. The check runs `ping -c 1` against the resolved host (from URL or bare address).

### Targets

- **Bare hostname or IP** is enough: `example.com`, `10.0.0.5`.
- URLs are accepted; the **hostname** is extracted (path and scheme ignored).

**Note:** Many cloud hosts block ICMP. If ping fails but HTTP/TCP succeed, prefer those checks or run Umpire where ICMP is allowed (often requires `CAP_NET_RAW` or running as root in containers).

UI reference: **Checks → Ping check** (`/plugins/check/ping`).

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHECK_TIMEOUT_MS` | `10000` | Overall ping timeout (ms) |

## API

No plugin HTTP routes.

## For developers

```text
plugins/check/ping/
  index.ts    # execFile('ping', …) + evaluateTarget
  ui/
```

- **`evaluateTarget`:** any valid target address.
- Depends on system `ping` binary in `PATH`.

See also: [Plugin developer guide](../../../docs/plugins.md).
