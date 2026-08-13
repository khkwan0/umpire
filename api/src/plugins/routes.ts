/**
 * Plugin HTTP route mounting and catalog.
 *
 * ## Why this exists
 *
 * Plugins may need their own CRUD (e.g. FCM device tokens) without stuffing
 * that logic into core Fastify route modules. Early on, `registerRoutes` was
 * handed the root app — plugins could register `/api/tokens` (or anything) and
 * silently collide with core or each other until Fastify failed at startup.
 *
 * This module exists to:
 * 1. **Namespace** every plugin under `/api/plugins/<kind>/<id>/…` so paths
 *    cannot overlap across plugins or with core `/api/targets`, etc.
 * 2. **Catalog** what each loaded plugin exposed, so `GET /api/plugins` can
 *    list plugins and their fully qualified routes for operators and UIs.
 *
 * Core stays responsible for the frozen monitoring API; plugins stay responsible
 * for plugin-owned data — but the host owns the URL map.
 *
 * ## Mental model
 *
 * ```
 * plugins.json loads → check / scheduler / notify instances
 *         │
 *         ▼
 * mountAllPluginRoutes(app, { checks, scheduler, notifiers })
 *         │
 *         ├─ for each plugin:
 *         │     prefix = /api/plugins/<kind>/<id>
 *         │     app.register(scoped => {
 *         │       onRoute → record method + full path into catalog
 *         │       plugin.registerRoutes?.(scoped)   // e.g. GET /tokens
 *         │     }, { prefix })
 *         │
 *         └─ catalog = [
 *              { id, kind, routes: [{ method, path }, …] },  // even if routes: []
 *              …
 *            ]
 *
 * GET /api/plugins  →  listPluginCatalog()
 * ```
 *
 * Plugins only see a **scoped** Fastify instance. They register relative paths
 * (`/tokens`, not `/api/plugins/notify/fcm/tokens`). The host applies the
 * prefix. A plugin with no `registerRoutes` still appears in the catalog with
 * an empty `routes` array.
 *
 * Within one plugin, registering the same method+path twice still fails Fastify
 * startup — the namespace only isolates *between* plugins.
 *
 * @see ../routes/plugins.ts — `GET /api/plugins`
 * @see ./types.ts — optional `registerRoutes` on check / scheduler / notify
 */

import type { FastifyInstance } from 'fastify'
import type {
  CheckPlugin,
  NotifierPlugin,
  SchedulerPlugin,
} from './types.js'

export type PluginKind = 'check' | 'scheduler' | 'notify'

/** One HTTP route a plugin registered (fully qualified path). */
export interface PluginRouteRef {
  method: string
  path: string
}

/** One loaded plugin and the routes mounted under its namespace (may be empty). */
export interface PluginCatalogEntry {
  id: string
  kind: PluginKind
  routes: PluginRouteRef[]
}

type RoutablePlugin = {
  id: string
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}

/** In-memory catalog filled by `mountAllPluginRoutes`; read by `GET /api/plugins`. */
const catalog: PluginCatalogEntry[] = []

export function clearPluginRouteCatalog(): void {
  catalog.length = 0
}

/** Snapshot of the catalog (defensive copies so callers cannot mutate state). */
export function listPluginCatalog(): PluginCatalogEntry[] {
  return catalog.map((e) => ({
    id: e.id,
    kind: e.kind,
    routes: e.routes.map((r) => ({ ...r })),
  }))
}

function normalizeMethods(method: string | string[]): string[] {
  const list = Array.isArray(method) ? method : [method]
  // Fastify also registers HEAD alongside GET; omit from the public catalog.
  return list
    .map((m) => m.toUpperCase())
    .filter((m) => m !== 'HEAD')
}

function fullPath(prefix: string, url: string): string {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base}${path}`
}

/**
 * Mount one plugin under `/api/plugins/<kind>/<id>` and append a catalog entry.
 *
 * If `registerRoutes` is missing, the plugin is still listed with `routes: []`.
 * Plugins must register paths relative to the scoped app (e.g. `/tokens`).
 */
export async function mountPluginRoutes(
  app: FastifyInstance,
  kind: PluginKind,
  plugin: RoutablePlugin,
): Promise<void> {
  const prefix = `/api/plugins/${kind}/${plugin.id}`
  const routes: PluginRouteRef[] = []

  if (plugin.registerRoutes) {
    await app.register(
      async (scoped) => {
        // Capture every route the plugin adds on this scoped instance.
        scoped.addHook('onRoute', (opts) => {
          const declared = opts.url.startsWith('/') ? opts.url : `/${opts.url}`
          // Fastify may report url with or without the encapsulation prefix.
          const path = declared.startsWith(prefix)
            ? declared
            : fullPath(opts.prefix || prefix, declared)
          for (const method of normalizeMethods(opts.method)) {
            routes.push({ method, path })
          }
        })
        await plugin.registerRoutes?.(scoped)
      },
      { prefix },
    )
  }

  // Dedupe method+path (Fastify may emit duplicates for some registrations).
  const seen = new Set<string>()
  const unique = routes.filter((r) => {
    const key = `${r.method} ${r.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  catalog.push({ id: plugin.id, kind, routes: unique })
}

/**
 * Clear and rebuild the catalog for all loaded plugins (checks → scheduler → notifiers).
 * Call once after core routes are registered; then expose `listPluginCatalog` via HTTP.
 */
export async function mountAllPluginRoutes(
  app: FastifyInstance,
  plugins: {
    checks: CheckPlugin[]
    scheduler: SchedulerPlugin
    notifiers: NotifierPlugin[]
  },
): Promise<void> {
  clearPluginRouteCatalog()
  for (const plugin of plugins.checks) {
    await mountPluginRoutes(app, 'check', plugin)
  }
  await mountPluginRoutes(app, 'scheduler', plugins.scheduler)
  for (const plugin of plugins.notifiers) {
    await mountPluginRoutes(app, 'notify', plugin)
  }
}
