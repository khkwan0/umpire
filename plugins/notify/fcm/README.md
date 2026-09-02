# `fcm` (notifier plugin)

Pushes alerts to Firebase Cloud Messaging (FCM) device tokens.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (loaded by default, **disabled** until you enable it).
2. **Settings → Plugin manager** → enable **fcm**.

### Service account (required)

Each UMPIRE server needs its own Firebase **Admin SDK service account** JSON. This is **plugin-owned**, not core.

#### Get the JSON from Firebase

1. Open [Firebase Console](https://console.firebase.google.com/) and select your project (or create one).
2. Click the **gear** → **Project settings**.
3. Open the **Service accounts** tab.
4. Click **Generate new private key** → **Generate key**.
5. Save the downloaded `.json` file (it contains a private key — treat it like a password).

For **iOS** push delivery, also configure Apple Push Notification service (APNs) in the same Firebase project:

1. **Project settings** → **Cloud Messaging** → your iOS app.
2. Upload an **APNs Authentication Key** (`.p8` from [Apple Developer](https://developer.apple.com/account/resources/authkeys/list)) or an APNs certificate.

Your mobile apps use separate client config files (`google-services.json` / `GoogleService-Info.plist`) from the same Firebase project. The service account JSON is **only for the server** to send pushes.

#### Upload in the UI (recommended)

1. **Notifiers → FCM FIDs** (`/plugins/notify/fcm`).
2. Under **Firebase service account**, paste the JSON or choose the downloaded file.
3. Click **Save credentials**.

The API stores the file and initializes Firebase immediately — **no restart required**.

#### Manual file (alternative)

| Step | Action |
|------|--------|
| 1 | Copy [`fcm-service-account.json.example`](fcm-service-account.json.example) to `data/fcm-service-account.json` (next to your SQLite file). |
| 2 | Replace placeholders with the JSON from Firebase (step above). |
| 3 | Restart the API (or upload via the UI to load without restart). |

Override path: `FCM_CREDENTIALS_PATH=/path/to/key.json`.

Until credentials are saved and Firebase initializes, `GET /api/notifiers` shows **`ready: false`** and test sends return **FCM not initialized**.

### Device destinations (tokens)

Manage device tokens separately from the service account:

| Where | Path |
|-------|------|
| UI | **Notifiers → FCM FIDs** (`/plugins/notify/fcm`) |
| Mobile app | Auto-registers via `POST …/tokens/register` |
| Sidecar | `data/fcm-tokens.json` |
| Override | `FCM_TOKENS_PATH` |

Add tokens one-by-one, import a JSON array (`POST …/tokens/import`), or let the mobile app register. Disabled rows never receive alerts.

### Per-target routing

**Targets → fcm settings** (or API `…/targets/:targetId/config`): optional `useCustom` + `token_ids` to limit which devices receive alerts for that target. Empty `token_ids` = all enabled destinations.

### Optional

| Variable | Purpose |
|----------|---------|
| `FCM_ANDROID_CHANNEL_ID` | Android notification channel id in outbound messages |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/fcm/credentials` | Service account status (no private key) |
| PUT | `/api/plugins/notify/fcm/credentials` | Upload service account JSON body |
| DELETE | `/api/plugins/notify/fcm/credentials` | Remove stored service account |
| GET | `/api/plugins/notify/fcm/tokens` | List destinations |
| POST | `/api/plugins/notify/fcm/tokens/register` | Mobile upsert (`fid` or `token`, optional `label`) |
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

There is no `GET/PUT /config` for global defaults — routing defaults to all enabled device tokens.

Core check allowlist: `GET/PUT /api/targets/:id/notifiers/fcm/check-ids`.

## Storage

| File / env | Purpose |
|------------|---------|
| `data/fcm-service-account.json` | Firebase Admin SDK credentials (upload via UI or copy manually) |
| `FCM_CREDENTIALS_PATH` | Override credentials path |
| `data/fcm-tokens.json` | Device token destination list |
| `FCM_TOKENS_PATH` | Override tokens path |

## For developers

```text
plugins/notify/fcm/
  index.ts
  credentials.ts    # parse, save, status for service account JSON
  runtime.ts          # apply/clear credentials + ready flag
  destinations.ts     # fcm-tokens.json CRUD
  config.ts           # per-target token_ids overrides
  send.ts             # firebase-admin multicast
  routes.ts
  fcm-service-account.json.example
  ui/TokensPage.tsx
```

- **`isReady()`:** credentials loaded + Firebase init succeeded (not “has any device tokens”).
- **`notify()`:** resolves destinations via override/global rules; soft-skips if none match; throws only if all sends fail.
- Reference for multi-destination CRUD, import, test sends, and sidecar secrets.

See also: [Plugin developer guide](../../../docs/plugins.md).
