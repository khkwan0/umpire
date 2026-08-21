# Plugins

Shipped **check**, **notifier**, and **scheduler** implementations live here so they are not buried under the API host.

```text
plugins/<kind>/<id>/
  index.ts     # required
  README.md    # usage + developer notes for this plugin
  routes.ts    # optional plugin HTTP
  ui/          # optional React page (globbed by the web app)
```

Do not confuse this folder with HTTP paths like `/api/plugins/<kind>/<id>/…` — those are the host namespace for plugin routes.

## Host vs implementations

| Piece | Path |
|-------|------|
| Implementations | this directory (`plugins/<kind>/<id>/`) |
| Host (contracts, loader, enable/disable, HTTP namespace) | [`api/src/plugins/`](../api/src/plugins/) |
| Load list | [`api/plugins.json`](../api/plugins.json) |
| Runtime enable/disable | [`data/plugin-manager.json`](../data/plugin-manager.json) |

Default **enabled** set: `http` check, `interval` scheduler, `webhook` notifier. Other loaded notifiers (FCM, Slack, Telegram, Discord, email) stay off until **Settings → Plugin manager**. New notifier ids default to disabled except `webhook`.

Write a plugin: **[Plugin developer guide](../docs/plugins.md)**. Change the host: **[Core developer guide](../docs/core.md)**.

## Plugin documentation

Each shipped plugin has its own **Usage** and **For developers** section in `README.md`:

### Checks

| Plugin | Doc | Summary |
|--------|-----|---------|
| `http` | [check/http/README.md](check/http/README.md) | HTTP(S) status + latency; global defaults + per-target overrides |
| `tls` | [check/tls/README.md](check/tls/README.md) | TLS handshake / cert validation |
| `keyword-body` | [check/keyword-body/README.md](check/keyword-body/README.md) | Response body must contain keyword |
| `tcp` | [check/tcp/README.md](check/tcp/README.md) | TCP connect to host:port |
| `ping` | [check/ping/README.md](check/ping/README.md) | ICMP ping (needs system `ping`) |

### Scheduler

| Plugin | Doc | Summary |
|--------|-----|---------|
| `interval` | [scheduler/interval/README.md](scheduler/interval/README.md) | Per-target timers (default; do not replace lightly) |

### Notifiers

| Plugin | Doc | Summary |
|--------|-----|---------|
| `webhook` | [notify/webhook/README.md](notify/webhook/README.md) | HTTP callback (enabled by default) |
| `fcm` | [notify/fcm/README.md](notify/fcm/README.md) | Firebase push; service account file + FID list |
| `slack` | [notify/slack/README.md](notify/slack/README.md) | Slack incoming webhook |
| `telegram` | [notify/telegram/README.md](notify/telegram/README.md) | Telegram bot |
| `discord` | [notify/discord/README.md](notify/discord/README.md) | Discord webhook |
| `email` | [notify/email/README.md](notify/email/README.md) | Sendmail or SMTP |
