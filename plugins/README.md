# Plugins

Shipped **check**, **notifier**, and **scheduler** implementations live here so they are not buried under the API host.

```text
plugins/<kind>/<id>/
  index.ts     # required
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

FCM (optional): copy [`notify/fcm/fcm-service-account.json.example`](notify/fcm/fcm-service-account.json.example) to `data/fcm-service-account.json`, then enable FCM in the plugin manager.

Write a plugin: **[Plugin developer guide](../docs/plugins.md)**. Change the host: **[Core developer guide](../docs/core.md)**.
