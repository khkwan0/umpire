import fs from 'node:fs'
import path from 'node:path'
import {getAuth, getChecks, getNotifiers, getScheduler} from './runtime.js'

type PluginKind = 'check' | 'notify' | 'scheduler' | 'auth'

type PluginFlags = {
  auth: Record<string, boolean>
  check: Record<string, boolean>
  notify: Record<string, boolean>
  scheduler: Record<string, boolean>
}

const flags: PluginFlags = {
  auth: {},
  check: {},
  notify: {},
  scheduler: {},
}

function managerPath(): string {
  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), 'plugin-manager.json')
}

function saveFlags(): void {
  const file = managerPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, JSON.stringify(flags, null, 2), 'utf8')
}

function loadFlags(): void {
  const file = managerPath()
  if (!fs.existsSync(file)) return
  try {
    const raw = JSON.parse(
      fs.readFileSync(file, 'utf8'),
    ) as Partial<PluginFlags>
    Object.assign(flags.auth, raw.auth ?? {})
    Object.assign(flags.check, raw.check ?? {})
    Object.assign(flags.notify, raw.notify ?? {})
    Object.assign(flags.scheduler, raw.scheduler ?? {})
  } catch (err) {
    console.error('[plugins:manager] failed to read plugin-manager.json', err)
  }
}

function ensureDefaults(): void {
  const auth = getAuth()
  if (auth && flags.auth[auth.id] === undefined) {
    flags.auth[auth.id] = true
  }
  for (const c of getChecks()) {
    if (flags.check[c.id] === undefined) flags.check[c.id] = true
  }
  for (const n of getNotifiers()) {
    if (flags.notify[n.id] === undefined)
      flags.notify[n.id] = n.id === 'webhook'
  }
  const s = getScheduler()
  if (flags.scheduler[s.id] === undefined) flags.scheduler[s.id] = true
}

export function initPluginManager(): void {
  loadFlags()
  ensureDefaults()
  saveFlags()
}

export function isPluginEnabled(kind: PluginKind, id: string): boolean {
  return flags[kind][id] !== false
}

export function setPluginEnabled(
  kind: PluginKind,
  id: string,
  enabled: boolean,
): void {
  flags[kind][id] = enabled
  saveFlags()
}

function pluginDescription(plugin: {description?: string}): string | null {
  if (typeof plugin.description !== 'string') return null
  const trimmed = plugin.description.trim()
  return trimmed === '' ? null : trimmed
}

export function pluginManagerState() {
  const auth = getAuth()
  const checks = getChecks().map(c => ({
    id: c.id,
    enabled: isPluginEnabled('check', c.id),
    description: pluginDescription(c),
  }))
  const notifiers = getNotifiers().map(n => ({
    id: n.id,
    enabled: isPluginEnabled('notify', n.id),
    ready: n.isReady(),
    description: pluginDescription(n),
  }))
  const scheduler = getScheduler()
  return {
    auth: auth
      ? {
          id: auth.id,
          enabled: isPluginEnabled('auth', auth.id),
          description: pluginDescription(auth),
        }
      : null,
    checks,
    scheduler: {
      id: scheduler.id,
      enabled: isPluginEnabled('scheduler', scheduler.id),
      description: pluginDescription(scheduler),
    },
    notifiers,
  }
}
