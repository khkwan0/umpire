# Chapter 4 — Notifier plugins

[← Check plugins](03-check-plugins.md) · [Guide index](README.md) · [Next: Scheduler plugins →](05-scheduler-plugins.md)

Notifier plugins **deliver** alerts that core already decided to send. They do not probe targets, do not decide alert policy, and do not filter on check allowlists (core does that before calling you).

## Minimum viable notifier

```typescript
// plugins/notify/hello/index.ts
import type { NotifierPlugin } from '../../../api/src/plugins/types.js'

const helloNotifier: NotifierPlugin = {
  id: 'hello',
  description: 'Logs alerts to the API console (hello world).',

  isReady() {
    return true
  },

  async notify(ctx) {
    console.log('[notify:hello]', ctx.event.title, ctx.event.body)
  },
}

export default helloNotifier
```

Register in `api/plugins.json`:

```json
{
  "checks": ["http"],
  "scheduler": "interval",
  "notifiers": ["webhook", "hello"]
}
```

**Important:** New notifier ids default to **disabled** in the plugin manager (except `webhook`). Enable `hello` in **Settings → Plugin manager** or it never runs.

Trigger an alert (temporarily set alert policy to `every_fail`) and watch API logs for `[notify:hello]`.

Optional route:

```typescript
async registerRoutes(app) {
  app.get('/ping', async () => ({ ok: true, plugin: 'hello', kind: 'notify' }))
}
```

## What happens when `notify()` runs

1. Scheduler runs checks; core records results.
2. Core evaluates alert policy (`state_change`, `every_fail`, `throttle`).
3. If alerting, core filters notifiers: plugin manager enabled ∩ target `notifier_ids`.
4. For each notifier, core reads `target_notifier_configs.check_ids` and skips if the alert does not match (see below).
5. Core calls `notify({ event, config })`.

Your plugin sends the message. Core calls `markAlertSent` only if you return without throwing (or after successful delivery).

## NotifyContext

```typescript
interface NotifyContext {
  event: AlertEvent      // title, body, checks[], status, target, …
  config: unknown        // per-target override from target_notifier_configs
}
```

Use `ctx.event.title` and `ctx.event.body` for the human-readable message. Use `ctx.event.checks[].id` for per-check routing — do not parse `error` or `body` strings for plugin ids.

## Readiness and error handling

| Situation | Expected behavior |
|-----------|-------------------|
| Not configured (no URL, no destinations) | `return` without throwing (soft skip) |
| Partial delivery (some destinations fail) | Plugin decides; FCM throws only if **all** fail |
| Total delivery failure | `throw` — alert not marked sent |
| `isReady() === false` | Dashboard shows not ready; core **still calls** `notify()` |

Implement honest `isReady()` for dashboard status. Handle the not-ready case inside `notify()` with a log + return.

## Core check allowlist (do not reimplement)

Stored in `target_notifier_configs` as `check_ids`. Core applies this in [`api/src/core/notifierRouting.ts`](../../api/src/core/notifierRouting.ts) **before** `notify()`.

| `check_ids` | Behavior |
|-------------|----------|
| `[]` | Notify on any alert, including recovery |
| `["http"]` | Only when check `http` **failed** this cycle; recoveries skipped |

Operators edit this on **Targets → notifier settings**. Plugins must not ship their own check-allowlist UI or filter in `notify()`.

## Example: sidecar notifier (webhook)

Shipped [`plugins/notify/webhook/`](../../plugins/notify/webhook/) — the standard notifier pattern:

```text
plugins/notify/webhook/
  index.ts       # init, isReady, notify, registerRoutes
  config.ts      # data/webhook.json sidecar
  send.ts        # HTTP delivery
  routes.ts      # GET/PUT /config, POST /test
  ui/            # Webhook settings page
```

Shell in `index.ts`:

```typescript
const webhookNotifier: NotifierPlugin = {
  id: 'webhook',

  init() {
    seedFromEnvIfNeeded()   // one-time migration only; prefer UI
    // log configured state
  },

  isReady() {
    return isConfigured(readDefaults())
  },

  async notify(ctx) {
    const config = resolveWebhookConfigForTarget(ctx.config)
    if (!isConfigured(config)) {
      console.warn('[notify:webhook] skip send — URL not configured')
      return
    }
    await sendAlert(config, ctx.event)
  },
}
```

Config layers match the HTTP check pattern:

- Global defaults in `data/webhook.json` (URL, method, headers)
- Per-target override in `target_notifier_configs`
- `resolveWebhookConfigForTarget(ctx.config)` merges them

Use shared route helpers for per-target CRUD: [`plugins/notify/shared/targetRoutes.ts`](../../plugins/notify/shared/targetRoutes.ts).

## Example: complex notifier (FCM)

Shipped [`plugins/notify/fcm/`](../../plugins/notify/fcm/) — many destinations, credentials, test sends:

| Piece | Implementation |
|-------|----------------|
| Credentials | `data/fcm-service-account.json` (Firebase Admin SDK) — upload via **Notifiers → FCM FIDs** or copy manually |
| Destinations | `data/fcm-tokens.json` — list of device FIDs |
| CRUD routes | `GET/POST/PATCH/DELETE /tokens`, `POST /tokens/:id/test` |
| Per-target routing | `token_ids` on override — empty = all enabled destinations |
| Send | Firebase `sendEachForMulticast`; throw only if all fail |
| UI | Full tokens page + dashboard widget |

`init()` loads credentials and initializes Firebase. If the file is missing, `isReady()` is false and `notify()` soft-skips.

Destination matching (plugin-owned, separate from core `check_ids`):

| Field | Empty | Non-empty |
|-------|-------|-----------|
| `token_ids` | all enabled destinations | only those ids |
| row `enabled` | — | `0` never receives |

No matching destinations → return without throwing.

## Example: thin notifier (Slack, Telegram, Discord, Email)

Shipped [`plugins/notify/slack/`](../../plugins/notify/slack/), [`telegram/`](../../plugins/notify/telegram/), etc. follow the webhook pattern at smaller scale:

- Sidecar for webhook URL / bot token / SMTP settings
- `send.ts` for delivery
- Shared `targetRoutes` for per-target overrides
- UI page for global config

Copy webhook when you have one destination type; copy FCM when operators manage a **list** of destinations.

## ntfy sketch (external service)

For a minimal external notifier without UI:

```typescript
const ntfy: NotifierPlugin = {
  id: 'ntfy',

  isReady() {
    return Boolean(this.url)
  },

  async notify(ctx) {
    if (!this.url) return   // soft skip
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { title: ctx.event.title, 'content-type': 'text/plain' },
      body: ctx.event.body,
    })
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`)
  },
}
```

For production, prefer sidecar + `GET/PUT /config` + UI like webhook — not `.env`.

## Testing notifier plugins

| Approach | Example |
|----------|---------|
| Config validation | [`plugins/notify/webhook/config.test.ts`](../../plugins/notify/webhook/config.test.ts) |
| Send logic with mocked fetch/SDK | [`plugins/notify/fcm/send.test.ts`](../../plugins/notify/fcm/send.test.ts) |
| Credentials path resolution | [`plugins/notify/fcm/credentials.test.ts`](../../plugins/notify/fcm/credentials.test.ts) |

Mock external HTTP/SDK calls. Assert soft skips do not throw; hard failures do.

## Notifier checklist

- [ ] `id` matches folder and `plugins.json`
- [ ] `isReady()` reflects real configuration state
- [ ] Soft skip when not configured; throw on hard failure
- [ ] Do not filter on `check_ids` in `notify()`
- [ ] Sidecar + routes + UI for operator-managed settings
- [ ] Enabled in plugin manager (notifiers default off except `webhook`)
- [ ] Test send endpoint for operator verification
