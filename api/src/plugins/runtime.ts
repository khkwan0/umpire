import type {
  CheckPlugin,
  NotifierPlugin,
  SchedulerPlugin,
  StorePlugin,
} from './types.js'

let store: StorePlugin | undefined
let check: CheckPlugin | undefined
let scheduler: SchedulerPlugin | undefined
let notifiers: NotifierPlugin[] = []

export function setStore(plugin: StorePlugin): void {
  store = plugin
}

export function setCheck(plugin: CheckPlugin): void {
  check = plugin
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

export function getCheck(): CheckPlugin {
  if (!check) throw new Error('Check plugin not initialized')
  return check
}

export function getScheduler(): SchedulerPlugin {
  if (!scheduler) throw new Error('Scheduler plugin not initialized')
  return scheduler
}

export function getNotifiers(): NotifierPlugin[] {
  return notifiers
}
