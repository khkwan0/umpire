import {isValidTargetAddress, parseTargetAddress} from './targetAddress.js'

describe('parseTargetAddress', () => {
  it('accepts http(s) URLs', () => {
    expect(parseTargetAddress('https://example.com/path')).toEqual({
      hostname: 'example.com',
      port: '',
      protocol: 'https:',
      hasScheme: true,
    })
    expect(parseTargetAddress('http://10.0.0.5:8080')).toEqual({
      hostname: '10.0.0.5',
      port: '8080',
      protocol: 'http:',
      hasScheme: true,
    })
  })

  it('accepts bare hostnames and IPs', () => {
    expect(parseTargetAddress('example.com')).toEqual({
      hostname: 'example.com',
      port: '',
      protocol: '',
      hasScheme: false,
    })
    expect(parseTargetAddress('10.0.0.5')).toEqual({
      hostname: '10.0.0.5',
      port: '',
      protocol: '',
      hasScheme: false,
    })
    expect(parseTargetAddress('10.0.0.5:8080')).toEqual({
      hostname: '10.0.0.5',
      port: '8080',
      protocol: '',
      hasScheme: false,
    })
  })

  it('rejects empty, paths without scheme, and unsupported schemes', () => {
    expect(parseTargetAddress('')).toBeNull()
    expect(parseTargetAddress('  ')).toBeNull()
    expect(parseTargetAddress('example.com/path')).toBeNull()
    expect(parseTargetAddress('ftp://example.com')).toBeNull()
    expect(parseTargetAddress('not a host')).toBeNull()
  })

  it('isValidTargetAddress mirrors parse', () => {
    expect(isValidTargetAddress('example.com')).toBe(true)
    expect(isValidTargetAddress('https://example.com')).toBe(true)
    expect(isValidTargetAddress('not a host')).toBe(false)
  })
})
