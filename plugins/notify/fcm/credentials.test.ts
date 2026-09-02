import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  credentialsStatus,
  parseServiceAccountInput,
  removeServiceAccount,
  serviceAccountPath,
  writeServiceAccount,
} from './credentials.js'

const validAccount = {
  type: 'service_account',
  project_id: 'umpire-test',
  private_key_id: 'key-id',
  private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
  client_email: 'firebase-adminsdk@umpire-test.iam.gserviceaccount.com',
  client_id: '123',
}

describe('fcm service account path', () => {
  const previousCredentials = process.env.FCM_CREDENTIALS_PATH
  const previousDatabase = process.env.DATABASE_PATH

  afterEach(() => {
    if (previousCredentials === undefined)
      delete process.env.FCM_CREDENTIALS_PATH
    else process.env.FCM_CREDENTIALS_PATH = previousCredentials
    if (previousDatabase === undefined) delete process.env.DATABASE_PATH
    else process.env.DATABASE_PATH = previousDatabase
  })

  it('uses FCM_CREDENTIALS_PATH when set', () => {
    const file = path.join(os.tmpdir(), 'custom-fcm.json')
    process.env.FCM_CREDENTIALS_PATH = file
    expect(serviceAccountPath()).toBe(path.resolve(file))
  })

  it('defaults to a sidecar next to DATABASE_PATH', () => {
    delete process.env.FCM_CREDENTIALS_PATH
    const dir = path.join(os.tmpdir(), 'umpire-fcm-creds')
    process.env.DATABASE_PATH = path.join(dir, 'monitor.sqlite')
    expect(serviceAccountPath()).toBe(
      path.join(dir, 'fcm-service-account.json'),
    )
  })
})

describe('parseServiceAccountInput', () => {
  it('accepts a Firebase service account JSON object', () => {
    const parsed = parseServiceAccountInput(validAccount)
    expect(parsed.project_id).toBe('umpire-test')
    expect(parsed.client_email).toBe(
      'firebase-adminsdk@umpire-test.iam.gserviceaccount.com',
    )
    expect(parsed.account.privateKey).toContain('BEGIN PRIVATE KEY')
  })

  it('rejects non-service-account JSON', () => {
    expect(() =>
      parseServiceAccountInput({...validAccount, type: 'user'}),
    ).toThrow(/service_account/)
  })

  it('rejects missing private_key', () => {
    const {private_key: _ignored, ...rest} = validAccount
    expect(() => parseServiceAccountInput(rest)).toThrow(/private_key/)
  })
})

describe('writeServiceAccount', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-cred-write-'))
    process.env.FCM_CREDENTIALS_PATH = path.join(tmpDir, 'fcm-service-account.json')
  })

  afterEach(() => {
    delete process.env.FCM_CREDENTIALS_PATH
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('writes JSON to the sidecar path', () => {
    writeServiceAccount(validAccount)
    const status = credentialsStatus()
    expect(status.configured).toBe(true)
    expect(status.project_id).toBe('umpire-test')
    expect(fs.existsSync(serviceAccountPath())).toBe(true)
  })

  it('removeServiceAccount deletes the sidecar file', () => {
    writeServiceAccount(validAccount)
    expect(removeServiceAccount()).toBe(true)
    expect(credentialsStatus().configured).toBe(false)
  })
})
