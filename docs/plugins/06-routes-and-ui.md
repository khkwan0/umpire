# Chapter 6 — HTTP routes & UI

[← Scheduler plugins](05-scheduler-plugins.md) · [Guide index](README.md) · [Next: Registration & testing →](07-registration-and-testing.md)

Optional extras for any plugin kind: plugin-owned HTTP under `/api/plugins/…`, a nav page in the web shell, and an optional dashboard panel.

## Plugin HTTP (`registerRoutes`)

`registerRoutes(app)` exposes **your plugin's** HTTP API. Core already has `/api/targets`, `/api/groups`, `/api/settings`, history, incidents, and status — do not recreate those.

### Mounting

At startup, the host calls `registerRoutes` with a Fastify instance already prefixed:

```text
/api/plugins/<kind>/<id>
```

Register **relative** paths:

```typescript
async registerRoutes(app: FastifyInstance) {
  app.get('/config', async () => readDefaults())
  app.put('/config', async (req, reply) => { /* … */ })
}
// → GET /api/plugins/notify/webhook/config
```

Host module: [`api/src/plugins/routes.ts`](../../api/src/plugins/routes.ts).

If you omit `registerRoutes`, the plugin still loads and appears in `GET /api/plugins` with `routes: []`.

### When you need routes

| Skip routes | Add routes |
|-------------|------------|
| Probe needs only `url` + interval | Destination lists, credentials, test-send |
| No operator-configurable settings | Per-target overrides beyond core fields |
| Shipped `ping`, `tls` | Shipped `http`, `webhook`, `fcm` |

Plugin settings belong in **sidecar files** + routes + UI — not `.env`.

### Standard route patterns

**Global config:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/config` | Read defaults |
| PUT | `/config` | Write defaults |
| POST | `/test` | Send test alert/probe |

**Per-target override:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/targets/:targetId/config` | Read `{ useCustom, defaults, override, effective }` |
| PUT | `/targets/:targetId/config` | Set override |
| DELETE | `/targets/:targetId/config` | Clear override |
| POST | `/targets/:targetId/test` | Test for one target |
| GET | `/overrides` | `{ targetIds: number[] }` |

**Destination CRUD (FCM-style):**

| Method | Path |
|--------|------|
| GET | `/tokens` |
| POST | `/tokens` |
| PATCH | `/tokens/:id` |
| DELETE | `/tokens/:id` |
| POST | `/tokens/:id/test` |

Shared notifier helpers: [`plugins/notify/shared/targetRoutes.ts`](../../plugins/notify/shared/targetRoutes.ts).

### Auth contract

When operators enable auth in Settings, core enforces permissions on **all** `/api/*` routes including plugin namespaces:

- Use real HTTP verbs: GET/HEAD for reads, POST/PUT/PATCH/DELETE for writes
- Custom roles may be limited to specific plugin `kind`/`id` pairs
- Do not reimplement users/roles/settings from a plugin

Optional helper: `getAuthContext(request)` from [`api/src/auth/`](../../api/src/auth/).

### OpenAPI / Swagger

Add Fastify `schema` so routes appear in `/documentation`. Shared components: [`api/src/openapi.ts`](../../api/src/openapi.ts).

## Plugin UI

Plugin screens live **next to the plugin**, not under `web/src/pages/`.

### Discovery

[`web/src/App.tsx`](../../web/src/App.tsx) globs:

```typescript
import.meta.glob('../../plugins/*/*/ui/index.tsx', { eager: true })
```

Exactly one file: `plugins/<kind>/<id>/ui/index.tsx`. Deeper nesting is not discovered.

### PluginUiModule contract

[`web/src/plugin-ui.ts`](../../web/src/plugin-ui.ts):

```typescript
import type { PluginUiModule } from '@umpire/plugin-ui'
import HelloPage from './HelloPage'

export default {
  id: 'hello',                    // must match plugin id
  kind: 'notify',                 // 'check' | 'scheduler' | 'notify'
  path: '/plugins/notify/hello',
  label: 'Hello',
  Component: HelloPage,
  // Dashboard: HelloWidget,       // optional home panel
} satisfies PluginUiModule
```

### Nav placement

| Kind | Nav location |
|------|--------------|
| `check` | **Checks** dropdown |
| `notify` | **Notifiers** dropdown |
| `scheduler` | Top-level link |

Routes appear only when:

1. Plugin is in `plugins.json` (returned by `GET /api/plugins`)
2. For check/notify: plugin is **enabled** in plugin manager

### Styling

- Import shared client: `@umpire/web-api` (alias to `web/src/api.ts`)
- Reuse CSS from [`web/src/styles.css`](../../web/src/styles.css): `panel`, `stack`, `form-row`, `muted`, `error`, `mono`
- Theme tokens (`--bg`, `--ink`, `--panel`, `--line`) follow light/dark automatically
- Timestamps: `formatTimestamp` from `@umpire/web-datetime` or `<FormattedTimestamp />`

Do not hardcode hex colors in plugin UI.

### Example page

```tsx
// plugins/notify/hello/ui/HelloPage.tsx
import { useEffect, useState } from 'react'

export default function HelloPage() {
  const [text, setText] = useState('loading…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/plugins/notify/hello/ping')
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText)
        setText(JSON.stringify(body))
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  return (
    <div className="stack">
      <section className="panel">
        <h2>Hello</h2>
        {error ? <p className="error">{error}</p> : <p className="mono">{text}</p>}
      </section>
    </div>
  )
}
```

For subdirectory deploys, use `withBase('/api/plugins/…')` or `@umpire/web-api` helpers.

## Dashboard widgets

The core Dashboard at `/` is not replaceable. Plugins may add a **panel** under the hero stats.

```typescript
import type { DashboardWidgetProps, PluginUiModule } from '@umpire/plugin-ui'

function HelloWidget({ status }: DashboardWidgetProps) {
  const ready = status.notifiers.find(n => n.id === 'hello')?.ready
  return <p className="muted">Notifier ready: {ready ? 'yes' : 'no'}</p>
}

export default {
  id: 'hello',
  kind: 'notify',
  path: '/plugins/notify/hello',
  label: 'Hello',
  Component: HelloPage,
  Dashboard: HelloWidget,
} satisfies PluginUiModule
```

Rules:

- `status` is the same payload from `GET /api/status` (polled every 5s by core dashboard)
- Do not start another `/api/status` loop — use `status` prop
- Fetch plugin-specific data from `/api/plugins/<kind>/<id>/…` when needed
- Core wraps widget in `<section className="panel">` with `label` as heading and **Open** link to `path`
- A plugin without `ui/index.tsx` cannot show a widget

## Typed web client

Hello world can use raw `fetch`. For several endpoints, add a namespace to [`web/src/api.ts`](../../web/src/api.ts):

```typescript
keywordBody: {
  get: (targetId: number) =>
    request<{ keyword: string; caseSensitive: boolean }>(
      `/api/plugins/check/keyword-body/targets/${targetId}/config`,
    ),
  put: (targetId: number, data: { keyword: string; caseSensitive: boolean }) =>
    request(`/api/plugins/check/keyword-body/targets/${targetId}/config`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
},
```

Plugin pages import `{ api, withBase } from '@umpire/web-api'`.

## Rebuild requirements

- **API restart** after changing plugin TypeScript (or use `tsx watch`)
- **Web rebuild** after adding/changing `ui/index.tsx` — Vite glob is build-time
- **Docker:** rebuild both `api` and `web` images from repo root
- Do not run `npm run dev` and docker compose simultaneously (both bind port 8089)
