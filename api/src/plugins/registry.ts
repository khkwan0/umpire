import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  getChecks,
  getNotifiers,
  getScheduler,
  hasNotifier,
  setChecks,
  setNotifiers,
  setScheduler,
} from './runtime.js'
import type { CheckPlugin, NotifierPlugin, SchedulerPlugin } from './types.js'

export {
  getChecks,
  getNotifiers,
  getScheduler,
  hasNotifier,
} from './runtime.js'

type PluginKind = 'check' | 'scheduler' | 'notify'

interface PluginsConfig {
  checks: string[]
  scheduler: string
  notifiers: string[]
}

const pluginsRoot = path.dirname(fileURLToPath(import.meta.url))

function pluginsConfigPath(): string {
  if (process.env.PLUGINS_CONFIG) {
    return path.resolve(process.env.PLUGINS_CONFIG)
  }
  // api/src/plugins → api/plugins.json
  return path.resolve(pluginsRoot, '../../plugins.json')
}

function loadConfig(): PluginsConfig {
  const file = pluginsConfigPath()
  if (!fs.existsSync(file)) {
    throw new Error(
      `plugins.json not found at ${file}. Create it or set PLUGINS_CONFIG.`,
    )
  }
  const raw = JSON.parse(
    fs.readFileSync(file, 'utf8'),
  ) as Partial<PluginsConfig>
  if (!Array.isArray(raw.checks) || raw.checks.length === 0) {
    throw new Error('plugins.json: checks must be a non-empty array of ids')
  }
  if (typeof raw.scheduler !== 'string' || !raw.scheduler.trim()) {
    throw new Error('plugins.json: scheduler must be a plugin id string')
  }
  if (!Array.isArray(raw.notifiers)) {
    throw new Error('plugins.json: notifiers must be an array of ids')
  }
  return {
    checks: raw.checks.map((id) => String(id)),
    scheduler: raw.scheduler.trim(),
    notifiers: raw.notifiers.map((id) => String(id)),
  }
}

function resolvePluginFile(kind: PluginKind, id: string): string {
  const kindRoot = path.join(pluginsRoot, kind)
  const candidates = [
    path.join(kindRoot, id, 'index.ts'),
    path.join(kindRoot, id, 'index.js'),
    path.join(kindRoot, id, 'index.mjs'),
    path.join(kindRoot, `${id}.ts`),
    path.join(kindRoot, `${id}.js`),
    path.join(kindRoot, `${id}.mjs`),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(
    `No ${kind} plugin "${id}" under ${kindRoot} (tried ${id}/index.ts, ${id}.ts, …)`,
  )
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

async function loadById<T extends { id: string }>(
  kind: PluginKind,
  id: string,
  guard: (value: unknown) => value is T,
  label: string,
): Promise<{ plugin: T; file: string }> {
  const file = resolvePluginFile(kind, id)
  const plugin = pickExport(await loadModule(file), file, guard, label)
  if (plugin.id !== id) {
    throw new Error(
      `${label} file "${file}" exports id="${plugin.id}" but plugins.json asked for "${id}"`,
    )
  }
  return { plugin, file }
}

export async function initPlugins(): Promise<void> {
  const config = loadConfig()
  console.log(`[plugins] config=${pluginsConfigPath()}`)

  const checks: CheckPlugin[] = []
  for (const id of config.checks) {
    const loaded = await loadById('check', id, isCheckPlugin, 'Check')
    checks.push(loaded.plugin)
    console.log(
      `[plugins] check=${loaded.plugin.id} (${path.basename(loaded.file)})`,
    )
  }
  setChecks(checks)

  const notifiers: NotifierPlugin[] = []
  for (const id of config.notifiers) {
    try {
      const loaded = await loadById('notify', id, isNotifierPlugin, 'Notifier')
      await loaded.plugin.init?.()
      notifiers.push(loaded.plugin)
      console.log(
        `[plugins] notifier=${loaded.plugin.id} ready=${loaded.plugin.isReady()} (${path.basename(loaded.file)})`,
      )
    } catch (err) {
      console.error(`[plugins] failed to load notifier "${id}"`, err)
    }
  }
  setNotifiers(notifiers)

  const loadedScheduler = await loadById(
    'scheduler',
    config.scheduler,
    isSchedulerPlugin,
    'Scheduler',
  )
  setScheduler(loadedScheduler.plugin)
  console.log(
    `[plugins] scheduler=${loadedScheduler.plugin.id} (${path.basename(loadedScheduler.file)})`,
  )
}

export function pluginStatus() {
  return {
    core: { engine: 'sqlite' },
    checks: getChecks().map((c) => ({ id: c.id })),
    scheduler: { id: getScheduler().id },
    notifiers: getNotifiers().map((n) => ({
      id: n.id,
      ready: n.isReady(),
    })),
  }
}
