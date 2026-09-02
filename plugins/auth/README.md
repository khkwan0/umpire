# Auth plugins

Auth plugins control login and access for the whole API. **Only one auth plugin can run at a time.**

| Topic | Where |
|-------|--------|
| Build your own auth flow | **[docs/plugins/08-auth-plugins.md](../docs/plugins/08-auth-plugins.md)** |
| Auth Settings UI (web + mobile) | [docs/plugins/06-routes-and-ui.md](../docs/plugins/06-routes-and-ui.md#auth-plugin-ui) |
| Operator setup (rbac, open mode, tokens) | [docs/core.md](../docs/core.md#authentication-and-rbac), [docs/api.md](../docs/api.md#authentication) |
| Shipped reference implementation | [`rbac/`](rbac/) |

## Quick facts

- **Single slot:** `"auth": "rbac"` in [`api/plugins.json`](../api/plugins.json) — one string, not a list.
- **Swap implementations:** change the id and restart the API; you cannot load two auth plugins.
- **Open mode:** remove `"auth"` from `plugins.json`, or disable auth in plugin manager (immediate).
- **Default:** `rbac` (sessions + Bearer tokens + roles).

## Directory layout

```
plugins/auth/
  rbac/              # shipped reference
    index.ts         # AuthPlugin export
    bootstrap.ts     # first admin from UMPIRE_ADMIN_*
    gate.ts          # resolvePrincipal + evaluateAccess
    routes.ts        # login, users, roles, tokens, rbac config
    ui/              # web Settings panels (Account, users, roles, tokens, …)
    mobile/          # Expo Settings panels (same features)
  <your-id>/         # your custom auth plugin
```

Each plugin exports a default `AuthPlugin` object from `index.ts`. Optional `ui/` and `mobile/` directories provide Settings panels embedded by core — see the developer guide for the full contract.
