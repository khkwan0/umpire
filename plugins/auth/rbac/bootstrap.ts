import {getCore} from '../../../api/src/core/index.js'

const BOOTSTRAP_ERROR =
  'Fresh install requires UMPIRE_ADMIN_USERNAME and UMPIRE_ADMIN_PASSWORD environment variables'

/** On first boot (zero users), create the admin account from env vars. */
export function rbacBootstrap(): void {
  const store = getCore()
  if (store.countUsers() > 0) return

  const username = process.env.UMPIRE_ADMIN_USERNAME?.trim() ?? ''
  const password = process.env.UMPIRE_ADMIN_PASSWORD ?? ''
  if (!username || !password) {
    console.error(`[auth:rbac] ${BOOTSTRAP_ERROR}`)
    process.exit(1)
  }

  try {
    store.bootstrapAdmin(username, password)
    console.log(`[auth:rbac] Bootstrap admin user "${username}" created`)
  } catch (err) {
    console.error(
      '[auth:rbac] Failed to bootstrap admin user:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  }
}
