import {isUnregisteredTokenError, testPushCopy} from './send.js'

describe('fcm send helpers', () => {
  it('detects unregistered token errors', () => {
    expect(
      isUnregisteredTokenError('messaging/registration-token-not-registered'),
    ).toBe(true)
    expect(isUnregisteredTokenError('something else')).toBe(false)
  })

  it('builds test push copy', () => {
    expect(testPushCopy('fid-1').body).toContain('fid: fid-1')
  })
})
