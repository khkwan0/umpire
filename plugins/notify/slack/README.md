# `slack` (notifier plugin)

Sends alerts to a Slack channel via an **incoming webhook** URL.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (loaded, **disabled** by default).
2. **Settings → Plugin manager** → enable **slack**.

### Configure

**Global defaults:**

| Where | Path |
|-------|------|
| UI | **Notifiers → Slack** (`/plugins/notify/slack`) |
| Sidecar | `data/slack.json` |
| API | `GET/PUT /api/plugins/notify/slack/config` |
| Test | `POST /api/plugins/notify/slack/test` |

Fields: `webhookUrl` (must be `https://…slack.com…`), `username` (default `UMPIRE`).

**Per-target override:** **Targets → slack settings** or `/api/plugins/notify/slack/targets/:targetId/config`.

**Ready:** global config has a non-empty Slack incoming webhook URL.

Create the webhook in Slack: **Apps → Incoming Webhooks** (or your workspace’s app config).

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/slack/config` | Global config |
| PUT | `/api/plugins/notify/slack/config` | Save global config |
| POST | `/api/plugins/notify/slack/test` | Test global config |
| GET | `/api/plugins/notify/slack/overrides` | Target ids with overrides |
| GET | `/api/plugins/notify/slack/targets/:targetId/config` | Effective + override |
| PUT | `/api/plugins/notify/slack/targets/:targetId/config` | Save override |
| DELETE | `/api/plugins/notify/slack/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/notify/slack/targets/:targetId/test` | Test effective config |

Core check allowlist: `GET/PUT /api/targets/:id/notifiers/slack/check-ids`.

## Storage

| File | Purpose |
|------|---------|
| `data/slack.json` | Global webhook URL and username |

## For developers

```text
plugins/notify/slack/
  index.ts
  config.ts
  send.ts
  routes.ts
  ui/
```

Same sidecar + per-target override pattern as **webhook** and **discord**.

See also: [Plugin developer guide](../../../docs/plugins.md).
