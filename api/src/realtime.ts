type StreamEvent =
  | 'plugin-manager.updated'
  | 'targets.updated'
  | 'status.updated'
  | 'incidents.updated'

type EventHandler = (event: StreamEvent, data: unknown) => void

const listeners = new Set<EventHandler>()

export function subscribeRealtime(handler: EventHandler): () => void {
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}

export function publishRealtime(event: StreamEvent, data: unknown = {}): void {
  for (const handler of listeners) {
    try {
      handler(event, data)
    } catch (err) {
      console.error('[realtime] listener failed', err)
    }
  }
}
