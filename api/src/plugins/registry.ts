import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHttpCheck } from './check/http.js'
import { createFcmNotifier } from './notify/fcm.js'
import { createWebhookNotifier } from './notify/webhook.js'
import {
  getCheck,
  getNotifiers,
  getScheduler,
  getStore,
  setCheck,
  setNotifiers,
  setScheduler,
  setStore,
} from './runtime.js'
import { createIntervalScheduler } from './scheduler/interval.js'
import { createSqliteStore } from './store/sqlite.js'
import type {
  CheckPlugin,
  NotifierPlugin,
  SchedulerPlugin,
  StorePlugin,
} from './types.js'

export {
  getCheck,
  getNotifiers,
  getScheduler,
  getStore,
} from './runtime.js'

const builtinStores: Record<string, () => StorePlugin> = {
  sqlite: createSqliteStore,
}

const builtinChecks: Record<string, () => CheckPlugin> = {
  http: createHttpCheck,
}

const builtinSchedulers: Record<string, () => SchedulerPlugin> = {
  interval: createIntervalScheduler,
}

const builtinNotifiers: Record<string, () => NotifierPlugin> = {
  fcm: createFcmNotifier,
  webhook: createWebhookNotifier,
}

function envOr(name: string, fallback: string): string {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : fallback
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function isNotifierPlugin(value: unknown): value is NotifierPlugin {
  if (!value || typeof value !== 'object') return false
  const n = value as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.isReady === 'function' &&
    typeof n.notify === 'function'
  )
}

function extractNotifier(mod: Record<string, unknown>, spec: string): NotifierPlugin {
  const candidates = [mod.default, mod.plugin, mod.notifier, mod]
  for (const c of candidates) {
    if (isNotifierPlugin(c)) return c
    if (typeof c === 'function') {
      const created = (c as () => unknown)()
      if (isNotifierPlugin(created)) return created
    }
  }
  throw new Error(
    `Notifier module "${spec}" must export a NotifierPlugin (default, plugin, or notifier)`,
  )
}

async function loadExternalNotifier(spec: string): Promise<NotifierPlugin> {
  const resolved =
    spec.startsWith('.') || spec.startsWith('/')
      ? pathToFileURL(path.resolve(spec)).href
      : spec
  const mod = (await import(resolved)) as Record<string, unknown>
  return extractNotifier(mod, spec)
}

async function resolveNotifier(spec: string): Promise<NotifierPlugin> {
  const factory = builtinNotifiers[spec]
  if (factory) return factory()
  return loadExternalNotifier(spec)
}

export async function initPlugins(databasePath: string): Promise<void> {
  const storeId = envOr('STORE_PLUGIN', 'sqlite')
  const checkId = envOr('CHECK_PLUGIN', 'http')
  const schedulerId = envOr('SCHEDULER_PLUGIN', 'interval')
  const notifierSpecs = parseList(envOr('NOTIFY_PLUGINS', 'fcm'))

  const storeFactory = builtinStores[storeId]
  if (!storeFactory) {
    throw new Error(
      `Unknown STORE_PLUGIN "${storeId}". Built-ins: ${Object.keys(builtinStores).join(', ')}`,
    )
  }
  const checkFactory = builtinChecks[checkId]
  if (!checkFactory) {
    throw new Error(
      `Unknown CHECK_PLUGIN "${checkId}". Built-ins: ${Object.keys(builtinChecks).join(', ')}`,
    )
  }
  const schedulerFactory = builtinSchedulers[schedulerId]
  if (!schedulerFactory) {
    throw new Error(
      `Unknown SCHEDULER_PLUGIN "${schedulerId}". Built-ins: ${Object.keys(builtinSchedulers).join(', ')}`,
    )
  }

  const store = storeFactory()
  store.init({ databasePath })
  setStore(store)
  console.log(`[plugins] store=${store.id}`)

  const check = checkFactory()
  setCheck(check)
  console.log(`[plugins] check=${check.id}`)

  const loaded: NotifierPlugin[] = []
  for (const spec of notifierSpecs) {
    try {
      const notifier = await resolveNotifier(spec)
      if (!isNotifierPlugin(notifier)) {
        throw new Error('invalid notifier shape')
      }
      await notifier.init?.()
      loaded.push(notifier)
      console.log(
        `[plugins] notifier=${notifier.id} ready=${notifier.isReady()}`,
      )
    } catch (err) {
      console.error(`[plugins] failed to load notifier "${spec}"`, err)
    }
  }
  setNotifiers(loaded)

  const scheduler = schedulerFactory()
  setScheduler(scheduler)
  console.log(`[plugins] scheduler=${scheduler.id}`)
}

export function pluginStatus() {
  return {
    store: { id: getStore().id },
    check: { id: getCheck().id },
    scheduler: { id: getScheduler().id },
    notifiers: getNotifiers().map((n) => ({
      id: n.id,
      ready: n.isReady(),
    })),
  }
}
