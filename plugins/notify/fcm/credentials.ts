import fs from 'node:fs'
import path from 'node:path'
import type {ServiceAccount} from 'firebase-admin/app'

const SIDECAR_NAME = 'fcm-service-account.json'

export interface FcmCredentialsStatus {
  configured: boolean
  project_id: string | null
  client_email: string | null
  client_id: string | null
  path: string
}

export interface ParsedServiceAccount {
  raw: Record<string, unknown>
  account: ServiceAccount
  project_id: string
  client_email: string
  client_id: string | null
}

export function serviceAccountPath(): string {
  const explicit = process.env.FCM_CREDENTIALS_PATH?.trim()
  if (explicit) return path.resolve(explicit)

  const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'
  return path.resolve(path.dirname(databasePath), SIDECAR_NAME)
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} required`)
  }
  return value.trim()
}

export function parseServiceAccountInput(input: unknown): ParsedServiceAccount {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('service account JSON must be an object')
  }
  const row = input as Record<string, unknown>
  const type = asNonEmptyString(row.type, 'type')
  if (type !== 'service_account') {
    throw new Error('type must be "service_account"')
  }
  const project_id = asNonEmptyString(row.project_id, 'project_id')
  const client_email = asNonEmptyString(row.client_email, 'client_email')
  const private_key = asNonEmptyString(row.private_key, 'private_key')
  const client_id =
    typeof row.client_id === 'string' && row.client_id.trim()
      ? row.client_id.trim()
      : null

  const account: ServiceAccount = {
    projectId: project_id,
    clientEmail: client_email,
    privateKey: private_key.replace(/\\n/g, '\n'),
  }

  return {
    raw: row,
    account,
    project_id,
    client_email,
    client_id,
  }
}

export function readServiceAccountFile(): ParsedServiceAccount | null {
  const file = serviceAccountPath()
  if (!fs.existsSync(file)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return parseServiceAccountInput(parsed)
  } catch (err) {
    console.error('[notify:fcm] failed to read credentials file', err)
    return null
  }
}

export function credentialsStatus(): FcmCredentialsStatus {
  const file = serviceAccountPath()
  if (!fs.existsSync(file)) {
    return {
      configured: false,
      project_id: null,
      client_email: null,
      client_id: null,
      path: file,
    }
  }
  try {
    const parsed = parseServiceAccountInput(
      JSON.parse(fs.readFileSync(file, 'utf8')) as unknown,
    )
    return {
      configured: true,
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      client_id: parsed.client_id,
      path: file,
    }
  } catch {
    return {
      configured: true,
      project_id: null,
      client_email: null,
      client_id: null,
      path: file,
    }
  }
}

export function writeServiceAccount(input: unknown): ParsedServiceAccount {
  const parsed = parseServiceAccountInput(input)
  const file = serviceAccountPath()
  fs.mkdirSync(path.dirname(file), {recursive: true})
  const stored = {
    ...parsed.raw,
    type: 'service_account',
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key:
      typeof parsed.raw.private_key === 'string'
        ? parsed.raw.private_key
        : parsed.account.privateKey,
  }
  fs.writeFileSync(file, JSON.stringify(stored, null, 2), 'utf8')
  return parsed
}

export function removeServiceAccount(): boolean {
  const file = serviceAccountPath()
  if (!fs.existsSync(file)) return false
  fs.unlinkSync(file)
  return true
}
