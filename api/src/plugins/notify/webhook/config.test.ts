import {
  isConfigured,
  normalizeConfig,
  parseHeaders,
  parseMethod,
  validateUrl,
} from './config.js'

describe('parseHeaders', () => {
  it('accepts a string map and rejects other shapes', () => {
    expect(parseHeaders(undefined)).toEqual({})
    expect(parseHeaders({ Authorization: 'Bearer x' })).toEqual({
      Authorization: 'Bearer x',
    })
    expect(() => parseHeaders(['x'])).toThrow(
      'headers must be a JSON object of string values',
    )
    expect(() => parseHeaders({ n: 1 })).toThrow(
      'headers values must be strings',
    )
  })
})

describe('parseMethod', () => {
  it('defaults to POST and uppercases valid methods', () => {
    expect(parseMethod(undefined)).toBe('POST')
    expect(parseMethod('get')).toBe('GET')
    expect(() => parseMethod('TRACE')).toThrow(/method must be one of/)
    expect(() => parseMethod(1)).toThrow(/method must be one of/)
  })
})

describe('validateUrl', () => {
  it('allows empty (not ready) and http(s) only', () => {
    expect(validateUrl('')).toBeNull()
    expect(validateUrl('  ')).toBeNull()
    expect(validateUrl('https://example.com/hook')).toBeNull()
    expect(validateUrl('ftp://example.com')).toBe('url must be http(s)')
    expect(validateUrl('not a url')).toBe('url is invalid')
  })
})

describe('normalizeConfig / isConfigured', () => {
  it('normalizes a valid body', () => {
    expect(
      normalizeConfig({
        url: ' https://hooks.test/x ',
        method: 'put',
        headers: { 'X-Token': 'a' },
      }),
    ).toEqual({
      url: 'https://hooks.test/x',
      method: 'PUT',
      headers: { 'X-Token': 'a' },
    })
  })

  it('is ready only with a non-empty valid URL', () => {
    expect(isConfigured({ url: '', method: 'POST', headers: {} })).toBe(false)
    expect(
      isConfigured({ url: 'https://hooks.test', method: 'POST', headers: {} }),
    ).toBe(true)
  })
})
