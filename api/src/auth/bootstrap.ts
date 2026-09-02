import {getCore} from '../core/index.js'

const BOOTSTRAP_ERROR =
  'Fresh install requires UMPIRE_ADMIN_USERNAME and UMPIRE_ADMIN_PASSWORD environment variables'

/**
 * On first boot (zero users), create the admin account from env vars.
 * On existing installs, ensure auth stays enabled. Exits the process on failure.
 */
export function ensureAuthBootstrap(): void {
  const store = getCore()
  if (store.countUsers() > 0) {
    store.ensureAuthEnabled()
    return
  }

  const username = process.env.UMPIRE_ADMIN_USERNAME?.trim() ?? ''
  const password = process.env.UMPIRE_ADMIN_PASSWORD ?? ''
  if (!username || !password) {
    console.error(`[auth] ${BOOTSTRAP_ERROR}`)
    process.exit(1)
  }

  try {
    store.bootstrapAdmin(username, password)
    store.ensureAuthEnabled()
    console.log(`[auth] Bootstrap admin user "${username}" created`)
  } catch (err) {
    console.error(
      '[auth] Failed to bootstrap admin user:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  }
}
