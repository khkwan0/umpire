import type {
  CheckPlugin,
  NotifierPlugin,
  SchedulerPlugin,
  StorePlugin,
} from './types.js'

let store: StorePlugin | undefined
let checks: CheckPlugin[] = []
let scheduler: SchedulerPlugin | undefined
let notifiers: NotifierPlugin[] = []

export function setStore(plugin: StorePlugin): void {
  store = plugin
}

export function setChecks(plugins: CheckPlugin[]): void {
  checks = plugins
}

export function setScheduler(plugin: SchedulerPlugin): void {
  scheduler = plugin
}

export function setNotifiers(plugins: NotifierPlugin[]): void {
  notifiers = plugins
}

export function getStore(): StorePlugin {
  if (!store) throw new Error('Store plugin not initialized')
  return store
}

export function getChecks(): CheckPlugin[] {
  return checks
}

export function getScheduler(): SchedulerPlugin {
  if (!scheduler) throw new Error('Scheduler plugin not initialized')
  return scheduler
}

export function getNotifiers(): NotifierPlugin[] {
  return notifiers
}
