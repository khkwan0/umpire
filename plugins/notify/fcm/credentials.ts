import path from 'node:path'

const SIDECAR_NAME = 'fcm-service-account.json'

export function serviceAccountPath(): string {
  const explicit = process.env.FCM_CREDENTIALS_PATH?.trim()
  if (explicit) return path.resolve(explicit)

  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), SIDECAR_NAME)
}
