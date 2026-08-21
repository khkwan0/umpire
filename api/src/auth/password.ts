import {randomBytes, scryptSync, timingSafeEqual} from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEYLEN = 64
const SALT_BYTES = 16

/** Format: scrypt$<salt_b64>$<hash_b64> */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'base64')
  const expected = Buffer.from(parts[2]!, 'base64')
  if (salt.length === 0 || expected.length === 0) return false
  const actual = scryptSync(password, salt, expected.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function assertPasswordPolicy(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
}
