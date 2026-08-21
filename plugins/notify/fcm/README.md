# `fcm` (notifier plugin)

Pushes alerts to Firebase Cloud Messaging (FCM) **FID** destinations.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (loaded by default, **disabled** until you enable it).
2. **Settings → Plugin manager** → enable **fcm**.

### Service account (required)

FCM needs a Firebase **Admin SDK service account** JSON on disk. This is **plugin-owned**, not core.

| Step | Action |
|------|--------|
| 1 | Copy [`fcm-service-account.json.example`](fcm-service-account.json.example) to `data/fcm-service-account.json` (next to your SQLite file). |
| 2 | Replace placeholders with a real key from Firebase Console → Project settings → Service accounts. |
| 3 | Restart the API (or ensure the file exists before first `init()`). |

Override path: `FCM_CREDENTIALS_PATH=/path/to/key.json`.

Until the credentials file exists and Firebase initializes, `GET /api/notifiers` shows **`ready: false`** and pushes are skipped.

### Device destinations (FIDs)

Manage FIDs separately from the service account:

| Where | Path |
|-------|------|
| UI | **Notifiers → FCM FIDs** (`/plugins/notify/fcm`) |
| Sidecar | `data/fcm-tokens.json` |
| Override | `FCM_TOKENS_PATH` |

Add FIDs one-by-one, import a JSON array (`POST …/tokens/import`), or test with `POST …/tokens/test`. Disabled rows never receive alerts.

### Per-target routing

**Targets → fcm settings** (or API `…/targets/:targetId/config`): optional `useCustom` + `token_ids` to limit which FIDs receive alerts for that target. Empty `token_ids` = all enabled destinations.

### Optional

| Variable | Purpose |
|----------|---------|
| `FCM_ANDROID_CHANNEL_ID` | Android notification channel id in outbound messages |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/fcm/tokens` | List destinations |
| POST | `/api/plugins/notify/fcm/tokens` | Create destination |
| PATCH | `/api/plugins/notify/fcm/tokens/:id` | Update label / enabled |
| DELETE | `/api/plugins/notify/fcm/tokens/:id` | Remove destination |
| POST | `/api/plugins/notify/fcm/tokens/import` | Bulk import `{ fids: [...] }` |
| POST | `/api/plugins/notify/fcm/tokens/test` | Test raw FID |
| POST | `/api/plugins/notify/fcm/tokens/:id/test` | Test saved destination |
| POST | `/api/plugins/notify/fcm/tokens/:id/received` | Device delivery confirmation |
| GET | `/api/plugins/notify/fcm/overrides` | Targets with custom routing |
| GET | `/api/plugins/notify/fcm/targets/:targetId/config` | Per-target override |
| PUT | `/api/plugins/notify/fcm/targets/:targetId/config` | Save override |
| DELETE | `/api/plugins/notify/fcm/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/notify/fcm/targets/:targetId/test` | Test alert for target |

There is no `GET/PUT /config` for global defaults — routing defaults to all enabled FIDs.

Core check allowlist: `GET/PUT /api/targets/:id/notifiers/fcm/check-ids`.

## Storage

| File / env | Purpose |
|------------|---------|
| `data/fcm-service-account.json` | Firebase Admin SDK credentials |
| `FCM_CREDENTIALS_PATH` | Override credentials path |
| `data/fcm-tokens.json` | FID destination list |
| `FCM_TOKENS_PATH` | Override tokens path |

## For developers

```text
plugins/notify/fcm/
  index.ts
  credentials.ts    # service account path resolution
  destinations.ts   # fcm-tokens.json CRUD
  config.ts         # per-target token_ids overrides
  send.ts           # firebase-admin multicast
  routes.ts
  fcm-service-account.json.example
  ui/TokensPage.tsx
```

- **`isReady()`:** credentials loaded + Firebase init succeeded (not “has any FIDs”).
- **`notify()`:** resolves destinations via override/global rules; soft-skips if none match; throws only if all sends fail.
- Reference for multi-destination CRUD, import, test sends, and sidecar secrets.

See also: [Plugin developer guide](../../../docs/plugins.md).
