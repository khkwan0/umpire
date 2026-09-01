import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  registerDestination,
  listDestinations,
  updateDestination,
} from './destinations.js'

describe('registerDestination', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-dest-'))
    process.env.FCM_TOKENS_PATH = path.join(tmpDir, 'fcm-tokens.json')
  })

  afterEach(() => {
    delete process.env.FCM_TOKENS_PATH
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('creates a new destination', () => {
    const row = registerDestination('abc:APA91bTest', 'phone')
    expect(row.fid).toBe('abc:APA91bTest')
    expect(row.label).toBe('phone')
    expect(row.enabled).toBe(1)
    expect(listDestinations()).toHaveLength(1)
  })

  it('upserts and re-enables an existing destination', () => {
    const first = registerDestination('abc:APA91bTest', 'phone')
    updateDestination(first.id, {enabled: false})
    const disabled = listDestinations().find(r => r.id === first.id)
    expect(disabled?.enabled).toBe(0)

    const second = registerDestination('abc:APA91bTest', 'phone-2')
    expect(second.id).toBe(first.id)
    expect(second.label).toBe('phone-2')
    expect(second.enabled).toBe(1)
  })
})
