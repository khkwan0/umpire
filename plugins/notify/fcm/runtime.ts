import {
  credentialsStatus,
  removeServiceAccount,
  writeServiceAccount,
} from './credentials.js'
import {
  isMessagingReady,
  remountFirebase,
  shutdownFirebase,
} from './send.js'

let ready = false

export function isFcmNotifierReady(): boolean {
  return ready
}

export function setFcmNotifierReady(next: boolean): void {
  ready = next
}

export function syncFcmNotifierReady(): void {
  ready = isMessagingReady()
}

export async function applyServiceAccount(input: unknown): Promise<{
  ok: boolean
  status: ReturnType<typeof credentialsStatus>
  error?: string
}> {
  try {
    const parsed = writeServiceAccount(input)
    await remountFirebase(parsed.account)
    syncFcmNotifierReady()
    if (!ready) {
      return {
        ok: false,
        status: credentialsStatus(),
        error: 'Firebase SDK did not initialize',
      }
    }
    console.log('[notify:fcm] credentials updated')
    return {ok: true, status: credentialsStatus()}
  } catch (err) {
    ready = false
    return {
      ok: false,
      status: credentialsStatus(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function clearServiceAccount(): Promise<void> {
  removeServiceAccount()
  await shutdownFirebase()
  ready = false
}
