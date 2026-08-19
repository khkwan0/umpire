import {
  fcmContent,
  isLegacyRegistrationToken,
  isUnregisteredTokenError,
  testPushCopy,
} from './send.js'

describe('isLegacyRegistrationToken', () => {
  it('detects APA91 registration tokens', () => {
    expect(isLegacyRegistrationToken('abc:APA91bxyz')).toBe(true)
    expect(isLegacyRegistrationToken('fid-only')).toBe(false)
  })
})

describe('isUnregisteredTokenError', () => {
  it('matches common FCM unregister messages', () => {
    expect(
      isUnregisteredTokenError('messaging/registration-token-not-registered'),
    ).toBe(true)
    expect(isUnregisteredTokenError('installation-id-not-registered')).toBe(
      true,
    )
    expect(isUnregisteredTokenError('boom')).toBe(false)
  })
})

describe('testPushCopy', () => {
  it('labels the destination kind in the body', () => {
    expect(testPushCopy('fid-1').body).toContain('fid: fid-1')
    expect(testPushCopy('x:APA91b').body).toContain('token: x:APA91b')
  })
})

describe('fcmContent', () => {
  it('builds a multi-platform notification payload', () => {
    const msg = fcmContent('Hello', 'World')
    expect(msg.notification).toEqual({ title: 'Hello', body: 'World' })
    expect(msg.data).toEqual({ title: 'Hello', body: 'World' })
    expect(msg.android?.priority).toBe('high')
    expect(msg.apns?.payload?.aps).toMatchObject({
      alert: { title: 'Hello', body: 'World' },
      sound: 'default',
    })
  })

  it('includes an Android channel when configured', () => {
    process.env.FCM_ANDROID_CHANNEL_ID = 'alerts'
    try {
      expect(fcmContent('t', 'b').android?.notification?.channelId).toBe(
        'alerts',
      )
    } finally {
      delete process.env.FCM_ANDROID_CHANNEL_ID
    }
  })
})
