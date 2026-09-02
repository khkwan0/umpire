# Chapter 8 — Auth plugins

[← Guide index](README.md) · [Previous: Registration & testing ←](07-registration-and-testing.md)

Auth is the fourth plugin kind. Unlike check / notify / scheduler plugins, auth plugins register routes on the **root** app (`/api/auth/*`, `/api/users`, …) and own the global request gate.

## Operator summary

| State | Behavior |
|-------|----------|
| No `"auth"` entry in `plugins.json`, or auth plugin **disabled** in plugin manager | **Open mode** — every request gets anonymous admin; no login |
| `"auth": "rbac"` loaded and **enabled** (default) | Login required; sessions, Bearer tokens, RBAC |
| rbac + **Allow read-only without signing in** (Settings) | Anonymous `GET`/`HEAD`/`OPTIONS`; writes need a signed-in user |

- **Toggle auth on/off:** Settings → Plugin manager → Auth → requires **API restart**
- **Read-only without login:** Settings → Authentication (admin) — applies **immediately**

See [Core guide — Authentication](../core.md#authentication-and-rbac) and [API guide](../api.md#authentication).

## Shipped reference: `rbac`

Location: [`plugins/auth/rbac/`](../../plugins/auth/rbac/)

| Piece | Role |
|-------|------|
| `bootstrap.ts` | Create first admin from `UMPIRE_ADMIN_*` on empty DB |
| `gate.ts` | Resolve session/Bearer principal; enforce write/admin/plugin ACL |
| `routes.ts` | Auth, users, roles, tokens routes + `PUT /api/plugins/auth/rbac/config` |
| `index.ts` | `AuthPlugin` export |

Registered in [`api/plugins.json`](../../api/plugins.json):

```json
{
  "auth": "rbac",
  "checks": ["http", "…"],
  "scheduler": "interval",
  "notifiers": ["webhook", "…"]
}
```

## `AuthPlugin` contract

Defined in [`api/src/plugins/types.ts`](../../api/src/plugins/types.ts):

```ts
interface AuthPlugin {
  id: string
  description?: string
  /** Called once at startup when the plugin is enabled */
  bootstrap(): void
  /** Register /api/auth, /api/users, /api/roles, /api/tokens, etc. */
  registerRoutes(app: FastifyInstance): Promise<void>
  /** Session/Bearer resolution; null → gate returns 401 (except public paths) */
  resolvePrincipal(req: FastifyRequest): AuthPrincipal | null
  /** Path/method ACL after principal is resolved */
  evaluateAccess(req: FastifyRequest, principal: AuthPrincipal): GateDecision
  /** Paths exempt from authentication */
  publicPaths(): Set<string>
}
```

Core owns a thin global hook ([`api/src/auth/gate.ts`](../../api/src/auth/gate.ts)):

- Auth **off** → attach `anonymousAdminPrincipal()` to every request
- Auth **on** → delegate to `getAuth().resolvePrincipal` + `evaluateAccess`

Auth plugins do **not** use `/api/plugins/auth/<id>/…` for their main routes (unlike check/notify). Optional plugin-specific config may live there — rbac uses `PUT /api/plugins/auth/rbac/config`.

## Schema and storage

Auth tables (`users`, `roles`, `sessions`, `api_tokens`, `role_plugins`) live in the **core frozen schema** ([`api/src/core/schema.ts`](../../api/src/core/schema.ts)). The rbac plugin reads/writes them via `getCore()`; when auth is disabled the tables are unused but remain for re-enable.

Role plugin allowlists reference **monitoring** plugin kinds only (`check`, `notify`, `scheduler`) — type `MonitoringPluginKind` in core.

## Writing a custom auth plugin

1. Create `plugins/auth/<id>/index.ts` exporting an `AuthPlugin` (default export).
2. Add `"auth": "<id>"` to `plugins.json` (only one auth slot).
3. Implement `bootstrap`, `registerRoutes`, `resolvePrincipal`, `evaluateAccess`, `publicPaths`.
4. Restart the API.

Future plugins (OAuth, LDAP, …) swap the `"auth"` id in `plugins.json`; the core gate and clients stay the same.

## Testing

- Core gate tests: [`api/src/auth/gate.test.ts`](../../api/src/auth/gate.test.ts) (permission helpers)
- Store/RBAC tests: [`api/src/auth/auth.test.ts`](../../api/src/auth/auth.test.ts)
- WebSocket bridge with open vs rbac mode: [`api/src/routes/ws.test.ts`](../../api/src/routes/ws.test.ts)

When adding an auth plugin, test bootstrap failure modes, public paths, and that `GET /api/auth/policy` reflects your plugin’s `auth_enabled` semantics.
