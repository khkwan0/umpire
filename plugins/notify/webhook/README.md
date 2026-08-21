# `webhook` (notifier plugin)

Delivers alert payloads to a configured HTTP URL using the chosen method and headers.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (shipped, **enabled by default**).
2. Turn on in **Settings → Plugin manager** if disabled.

### Configure

**Global defaults:**

| Where | Path |
|-------|------|
| UI | **Notifiers → Webhook** (`/plugins/notify/webhook`) |
| Sidecar | `data/webhook.json` |
| API | `GET/PUT /api/plugins/notify/webhook/config` |
| Test | `POST /api/plugins/notify/webhook/test` |

Fields: `url`, `method` (GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS), `headers`.

**Per-target override** (optional): **Targets → webhook settings** or `GET/PUT/DELETE /api/plugins/notify/webhook/targets/:targetId/config`.

**Ready:** `GET /api/notifiers` shows `ready: true` when global defaults have a valid `http://` or `https://` URL. Until then, alerts are skipped for targets using global config.

**One-time seed:** If `data/webhook.json` is missing, `WEBHOOK_URL` and optional `WEBHOOK_HEADERS` (JSON string) can seed the sidecar on first read.

### Payload

- **POST, PUT, PATCH, DELETE:** JSON body (`AlertEvent`).
- **GET, HEAD, OPTIONS:** event fields on the query string.

### Targets

Leave notifier boxes unchecked to use all **enabled** notifiers, or select **webhook** only. Per-target overrides can point different targets at different URLs.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/webhook/config` | Global config |
| PUT | `/api/plugins/notify/webhook/config` | Save global config |
| POST | `/api/plugins/notify/webhook/test` | Test with global config |
| GET | `/api/plugins/notify/webhook/overrides` | Target ids with overrides |
| GET | `/api/plugins/notify/webhook/targets/:targetId/config` | Effective + override |
| PUT | `/api/plugins/notify/webhook/targets/:targetId/config` | Save override |
| DELETE | `/api/plugins/notify/webhook/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/notify/webhook/targets/:targetId/test` | Test effective config |

Core **check allowlist** for this notifier (which failed checks trigger alerts): `GET/PUT /api/targets/:id/notifiers/webhook/check-ids`.

## Storage

| File / env | Purpose |
|------------|---------|
| `data/webhook.json` | Global URL, method, headers |
| `WEBHOOK_URL`, `WEBHOOK_HEADERS` | Optional first-run seed only |
| `DATABASE_PATH` | Sidecar directory |

## For developers

```text
plugins/notify/webhook/
  index.ts
  config.ts
  send.ts
  routes.ts
  ui/
```

Uses shared [`../shared/targetRoutes.ts`](../shared/targetRoutes.ts) for per-target CRUD. Reference for sidecar + test + UI pattern.

See also: [Plugin developer guide](../../../docs/plugins.md).
