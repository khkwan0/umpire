# `telegram` (notifier plugin)

Sends alerts to a Telegram chat via a **bot token** and **chat id**.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (loaded, **disabled** by default).
2. **Settings → Plugin manager** → enable **telegram**.

### Configure

**Global defaults:**

| Where | Path |
|-------|------|
| UI | **Notifiers → Telegram** (`/plugins/notify/telegram`) |
| Sidecar | `data/telegram.json` |
| API | `GET/PUT /api/plugins/notify/telegram/config` |
| Test | `POST /api/plugins/notify/telegram/test` |

Fields:

| Field | Required | Notes |
|-------|----------|-------|
| `botToken` | Yes | From [@BotFather](https://t.me/BotFather) |
| `chatId` | Yes | User, group, or channel id |
| `threadId` | No | Forum topic id (optional) |

**Per-target override:** **Targets → telegram settings** or API `…/targets/:targetId/config`.

**Ready:** non-empty `botToken` and `chatId` in global defaults.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/telegram/config` | Global config |
| PUT | `/api/plugins/notify/telegram/config` | Save global config |
| POST | `/api/plugins/notify/telegram/test` | Test global config |
| GET | `/api/plugins/notify/telegram/overrides` | Target ids with overrides |
| GET | `/api/plugins/notify/telegram/targets/:targetId/config` | Effective + override |
| PUT | `/api/plugins/notify/telegram/targets/:targetId/config` | Save override |
| DELETE | `/api/plugins/notify/telegram/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/notify/telegram/targets/:targetId/test` | Test effective config |

Core check allowlist: `GET/PUT /api/targets/:id/notifiers/telegram/check-ids`.

## Storage

| File | Purpose |
|------|---------|
| `data/telegram.json` | Bot token, chat id, optional thread id |

## For developers

```text
plugins/notify/telegram/
  index.ts
  config.ts
  send.ts      # Telegram Bot API sendMessage
  routes.ts
  ui/
```

See also: [Plugin developer guide](../../../docs/plugins.md).
