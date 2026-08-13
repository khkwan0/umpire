import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  getChecks,
  getNotifiers,
  getScheduler,
  getStore,
  setChecks,
  setNotifiers,
  setScheduler,
  setStore,
} from './runtime.js'
import type {
  CheckPlugin,
  NotifierPlugin,
  SchedulerPlugin,
  StorePlugin,
} from './types.js'

export {
  getChecks,
  getNotifiers,
  getScheduler,
  getStore,
} from './runtime.js'

type PluginKind = 'store' | 'check' | 'scheduler' | 'notify'

const pluginsRoot = path.dirname(fileURLToPath(import.meta.url))

function enabledDir(kind: PluginKind): string {
  return path.join(pluginsRoot, kind, 'enabled')
}

function isPluginModule(name: string): boolean {
  if (name.startsWith('.')) return false
  return (
    name.endsWith('.js') ||
    name.endsWith('.mjs') ||
    name.endsWith('.cjs') ||
    name.endsWith('.ts')
  ) && !name.endsWith('.d.ts')
}

function listEnabledModules(kind: PluginKind): string[] {
  const dir = enabledDir(kind)
  if (!fs.existsSync(dir)) {
    throw new Error(`Plugin enabled directory missing: ${dir}`)
  }
  return fs
    .readdirSync(dir)
    .filter(isPluginModule)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name))
}

function pickExport<T>(
  mod: Record<string, unknown>,
  filePath: string,
  guard: (value: unknown) => value is T,
  kind: string,
): T {
  for (const key of ['default', 'plugin'] as const) {
    const value = mod[key]
    if (guard(value)) return value
  }
  if (guard(mod)) return mod as T
  throw new Error(
    `${kind} module "${filePath}" must export a plugin object as default or plugin`,
  )
}

function isStorePlugin(value: unknown): value is StorePlugin {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.id === 'string' && typeof p.init === 'function'
}

function isCheckPlugin(value: unknown): value is CheckPlugin {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.id === 'string' && typeof p.check === 'function'
}

function isSchedulerPlugin(value: unknown): value is SchedulerPlugin {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.start === 'function' &&
    typeof p.stop === 'function' &&
    typeof p.reschedule === 'function'
  )
}

function isNotifierPlugin(value: unknown): value is NotifierPlugin {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.isReady === 'function' &&
    typeof p.notify === 'function'
  )
}

async function loadModule(filePath: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(filePath).href)) as Record<string, unknown>
}

async function loadEnabled<T>(
  kind: PluginKind,
  guard: (value: unknown) => value is T,
  label: string,
): Promise<Array<{ plugin: T; file: string }>> {
  const files = listEnabledModules(kind)
  const loaded: Array<{ plugin: T; file: string }> = []
  for (const file of files) {
    try {
      const plugin = pickExport(await loadModule(file), file, guard, label)
      loaded.push({ plugin, file })
    } catch (err) {
      console.error(`[plugins] failed to load ${label} from ${file}`, err)
    }
  }
  return loaded
}

export async function initPlugins(databasePath: string): Promise<void> {
  const stores = await loadEnabled('store', isStorePlugin, 'Store')
  if (stores.length === 0) {
    throw new Error(
      `No store plugins in ${enabledDir('store')}. Add one (e.g. sqlite.ts → available).`,
    )
  }
  if (stores.length > 1) {
    throw new Error(
      `Expected exactly one store in enabled/, found ${stores.length}: ${stores.map((s) => path.basename(s.file)).join(', ')}`,
    )
  }
  const store = stores[0]!.plugin
  store.init({ databasePath })
  setStore(store)
  console.log(`[plugins] store=${store.id} (${path.basename(stores[0]!.file)})`)

  const checks = await loadEnabled('check', isCheckPlugin, 'Check')
  if (checks.length === 0) {
    throw new Error(
      `No check plugins in ${enabledDir('check')}. Enable at least one under check/enabled/.`,
    )
  }
  setChecks(checks.map((c) => c.plugin))
  for (const c of checks) {
    console.log(`[plugins] check=${c.plugin.id} (${path.basename(c.file)})`)
  }

  const notifiers = await loadEnabled('notify', isNotifierPlugin, 'Notifier')
  for (const n of notifiers) {
    try {
      await n.plugin.init?.()
      console.log(
        `[plugins] notifier=${n.plugin.id} ready=${n.plugin.isReady()} (${path.basename(n.file)})`,
      )
    } catch (err) {
      console.error(
        `[plugins] failed to init notifier from ${n.file}`,
        err,
      )
    }
  }
  setNotifiers(notifiers.map((n) => n.plugin))

  const schedulers = await loadEnabled('scheduler', isSchedulerPlugin, 'Scheduler')
  if (schedulers.length === 0) {
    throw new Error(
      `No scheduler plugins in ${enabledDir('scheduler')}. Enable one under scheduler/enabled/.`,
    )
  }
  if (schedulers.length > 1) {
    throw new Error(
      `Expected exactly one scheduler in enabled/, found ${schedulers.length}: ${schedulers.map((s) => path.basename(s.file)).join(', ')}`,
    )
  }
  const scheduler = schedulers[0]!.plugin
  setScheduler(scheduler)
  console.log(
    `[plugins] scheduler=${scheduler.id} (${path.basename(schedulers[0]!.file)})`,
  )
}

export function pluginStatus() {
  return {
    store: { id: getStore().id },
    checks: getChecks().map((c) => ({ id: c.id })),
    scheduler: { id: getScheduler().id },
    notifiers: getNotifiers().map((n) => ({
      id: n.id,
      ready: n.isReady(),
    })),
  }
}
