# `discord` (notifier plugin)

Sends alerts to a Discord channel via a **webhook URL**.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (loaded, **disabled** by default).
2. **Settings → Plugin manager** → enable **discord**.

### Configure

**Global defaults:**

| Where | Path |
|-------|------|
| UI | **Notifiers → Discord** (`/plugins/notify/discord`) |
| Sidecar | `data/discord.json` |
| API | `GET/PUT /api/plugins/notify/discord/config` |
| Test | `POST /api/plugins/notify/discord/test` |

Fields: `webhookUrl` (`https://discord.com/api/webhooks/…` or `discordapp.com`), `username` (default `UMPIRE`).

**Per-target override:** **Targets → discord settings** or API `…/targets/:targetId/config`.

**Ready:** non-empty valid Discord webhook URL in global defaults.

Create a webhook in Discord: **Channel settings → Integrations → Webhooks**.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/discord/config` | Global config |
| PUT | `/api/plugins/notify/discord/config` | Save global config |
| POST | `/api/plugins/notify/discord/test` | Test global config |
| GET | `/api/plugins/notify/discord/overrides` | Target ids with overrides |
| GET | `/api/plugins/notify/discord/targets/:targetId/config` | Effective + override |
| PUT | `/api/plugins/notify/discord/targets/:targetId/config` | Save override |
| DELETE | `/api/plugins/notify/discord/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/notify/discord/targets/:targetId/test` | Test effective config |

Core check allowlist: `GET/PUT /api/targets/:id/notifiers/discord/check-ids`.

## Storage

| File | Purpose |
|------|---------|
| `data/discord.json` | Webhook URL and username |

## For developers

```text
plugins/notify/discord/
  index.ts
  config.ts
  send.ts
  routes.ts
  ui/
```

Same pattern as **slack** (incoming webhook + optional per-target override).

See also: [Plugin developer guide](../../../docs/plugins.md).
