import os from 'node:os'
import path from 'node:path'
import {serviceAccountPath} from './credentials.js'

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
