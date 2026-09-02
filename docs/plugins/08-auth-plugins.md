# Chapter 8 — Auth plugins

[← Guide index](README.md) · [Previous: Registration & testing ←](07-registration-and-testing.md)

Auth is the fourth plugin kind. An auth plugin owns **how callers prove identity** and **what they may do** on `/api/*`. Core runs a single global gate and delegates to the active plugin — or grants anonymous admin when auth is off.

---

## One auth plugin at a time

This is a hard rule, not a convention:

| Rule | Detail |
|------|--------|
| **Single slot** | `plugins.json` has one `"auth"` key — a string id, not an array |
| **One loaded module** | Core loads exactly one implementation from `plugins/auth/<id>/` |
| **One active gate** | At startup, enablement is snapshotted; one plugin’s `resolvePrincipal` + `evaluateAccess` runs for every request |
| **No stacking** | You cannot run `rbac` and OAuth side by side — pick one id and swap it |

To change auth systems, set `"auth": "your-id"` in `plugins.json` (or disable auth for open mode) and **restart the API**. Toggling enable/disable in plugin manager also requires a restart.

```json
{
  "auth": "rbac",
  "checks": ["http"],
  "scheduler": "interval",
  "notifiers": ["webhook"]
}
```

Remove the `"auth"` line entirely for open mode (anonymous admin, no login).

---

## Request flow

```text
HTTP request
  → core onRequest hook (api/src/auth/gate.ts)
  → auth plugin disabled?  → anonymous admin principal
  → path in publicPaths()? → skip auth
  → resolvePrincipal(req)  → null → 401 (or anonymous read if plugin allows)
  → evaluateAccess(req, principal) → 403 or continue
  → route handler (req.auth set)
```

Your plugin implements the middle steps. Core never runs two auth plugins in this chain.

---

## Build your own auth plugin

### 1. Create the module

```
plugins/auth/<your-id>/
  index.ts      # default export: AuthPlugin
  bootstrap.ts  # optional first-run setup
  gate.ts       # resolvePrincipal + evaluateAccess helpers
  routes.ts     # login, policy, token endpoints you expose
```

Minimal skeleton:

```ts
// plugins/auth/example/index.ts
import type {AuthPlugin} from '../../../api/src/plugins/types.js'

const example: AuthPlugin = {
  id: 'example',
  description: 'Example auth — replace with your flow',

  bootstrap() {
    // First-start setup: seed users, read env, exit on misconfig, etc.
  },

  async registerRoutes(app) {
    // Register YOUR login/callback/token routes on the root app.
    app.get('/api/auth/policy', async () => ({
      auth_enabled: true,
      allow_readonly_without_auth: false,
      login_required: true,
      user_count: 0,
    }))
    app.post('/api/auth/login', async (req, reply) => {
      // Validate credentials, set session cookie or return token payload.
      // Attach principal shape expected by clients (see below).
    })
    app.get('/api/auth/me', async (req, reply) => {
      // Return { principal } for the current req.auth / resolvePrincipal.
    })
  },

  resolvePrincipal(req) {
    // Read session cookie, Bearer header, mTLS cert, etc.
    // Return AuthPrincipal or null if unauthenticated.
    return null
  },

  evaluateAccess(req, principal) {
    // Return { ok: true } or { ok: false, status: 401|403, error: '…' }
    if (!principal.can_write && req.method !== 'GET') {
      return {ok: false, status: 403, error: 'Write access required'}
    }
    return {ok: true}
  },

  publicPaths() {
    return new Set([
      '/api/health',
      '/api/auth/policy',
      '/api/auth/login',
      '/api/auth/logout',
      // Add OAuth callback paths, JWKS, etc.
    ])
  },
}

export default example
```

### 2. Register it

1. Add `"auth": "example"` to [`api/plugins.json`](../../api/plugins.json) (replaces any other auth id).
2. Restart the API.
3. Confirm stdout: `[plugins] auth=example (index.ts)`.

Plugin manager will show **Auth → example** (enabled by default on first run).

### 3. Implement the contract

Full TypeScript interface: [`api/src/plugins/types.ts`](../../api/src/plugins/types.ts) (`AuthPlugin`).

| Method | Responsibility |
|--------|----------------|
| `bootstrap()` | Runs once at startup when the plugin is **enabled** |
| `registerRoutes(app)` | Mount routes on the **root** Fastify app (not under `/api/plugins/…`) |
| `resolvePrincipal(req)` | Map request → `AuthPrincipal \| null` |
| `evaluateAccess(req, principal)` | Path/method ACL after identity is known |
| `publicPaths()` | Paths that skip the gate entirely |

### 4. Return `AuthPrincipal` clients understand

Web and mobile UIs gate on this shape:

```ts
interface AuthPrincipal {
  kind: 'anonymous' | 'user'
  user: User | null          // null when anonymous
  is_admin: boolean
  can_write: boolean
  plugins: 'all' | Array<{ kind: 'check'|'notify'|'scheduler'; id: string }>
}
```

- **`can_write: false`** — UI hides create/edit/delete; gate should block mutating HTTP methods.
- **`is_admin: true`** — required for `/api/users`, `/api/roles`, settings writes, plugin-manager mutations.
- **`plugins`** — monitoring-plugin allowlist for `/api/plugins/check|notify|scheduler/…` (rbac uses this; your plugin may ignore or map from your own roles).

### 5. Expose routes your clients need

The shipped web/mobile apps expect these when auth is on (you may extend, not break, the policy contract):

| Route | Purpose |
|-------|---------|
| `GET /api/auth/policy` | **Public.** `{ auth_enabled, allow_readonly_without_auth, login_required, user_count }` — drives login redirect |
| `GET /api/auth/me` | Current principal (401 if none) |
| `POST /api/auth/login` | Your sign-in flow (form login, API key exchange, etc.) |
| `POST /api/auth/logout` | End session (optional for pure Bearer setups) |

Headless clients can skip the UI entirely: call your login route, then send the session cookie or `Authorization: Bearer …` on later requests. See [API guide — Authentication](../api.md#authentication).

You **do not** have to reuse rbac’s username/password tables. You **do** need a coherent story for `policy`, `me`, and how `resolvePrincipal` reads whatever credential you issued in `login`.

### 6. Optional: reuse core SQLite auth tables

The frozen schema includes `users`, `roles`, `sessions`, `api_tokens`, `role_plugins`. The **`rbac`** plugin uses them via `getCore()`. Your plugin may:

- **Reuse** them (fastest path to RBAC-compatible UI), or
- **Ignore** them and store identity elsewhere (Postgres, LDAP, JWT only), or
- **Mix** — e.g. OAuth login that upserts into `users` for agent chat ownership.

Tables stay in core schema even when auth is disabled.

### 7. Test and ship

- Unit-test `resolvePrincipal` / `evaluateAccess` with mocked requests.
- Integration-test: API starts, `GET /api/auth/policy`, login, mutating route with/without credentials.
- Reference tests: [`api/src/auth/gate.test.ts`](../../api/src/auth/gate.test.ts), [`api/src/routes/ws.test.ts`](../../api/src/routes/ws.test.ts).

---

## Swapping `rbac` for your plugin

1. Implement `plugins/auth/<your-id>/` (copy structure from [`plugins/auth/rbac/`](../../plugins/auth/rbac/) as a starting point).
2. Change `"auth": "rbac"` → `"auth": "<your-id>"` in `plugins.json`.
3. Restart the API.
4. Update web login UI if your flow is not username/password — today [`web/src/pages/Login.tsx`](../../web/src/pages/Login.tsx) is generic; OAuth may need a plugin-owned page or redirect in `registerRoutes`.

Only one auth plugin is loaded; changing the id is how you switch implementations.

---

## Shipped reference: `rbac`

Default plugin: username/password sessions, API Bearer tokens, roles, optional anonymous read-only.

| File | Role |
|------|------|
| `bootstrap.ts` | First admin from `UMPIRE_ADMIN_*` on empty DB |
| `gate.ts` | Session/Bearer resolution + RBAC ACL |
| `routes.ts` | Auth, users, roles, tokens + readonly config |
| `index.ts` | `AuthPlugin` export |

Operator docs: [Core guide — Authentication](../core.md#authentication-and-rbac), [API guide](../api.md#authentication).

---

## Operator summary (rbac)

| State | Behavior |
|-------|----------|
| No `"auth"` or auth **disabled** | Open mode — anonymous admin |
| `rbac` **enabled** | Login required (default) |
| rbac + read-only without sign-in | Anonymous GET; writes need login |

- Auth on/off in plugin manager → **restart required**
- Read-only toggle in Settings → **immediate** (rbac only)
