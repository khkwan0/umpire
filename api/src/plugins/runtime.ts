import type {CheckPlugin, NotifierPlugin, SchedulerPlugin} from './types.js'

let checks: CheckPlugin[] = []
let scheduler: SchedulerPlugin | undefined
let notifiers: NotifierPlugin[] = []

export function setChecks(plugins: CheckPlugin[]): void {
  checks = plugins
}

export function setScheduler(plugin: SchedulerPlugin): void {
  scheduler = plugin
}

export function setNotifiers(plugins: NotifierPlugin[]): void {
  notifiers = plugins
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

export function hasNotifier(id: string): boolean {
  return notifiers.some(n => n.id === id)
}
