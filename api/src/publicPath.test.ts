import {publicUrlPrefix, requestPublicPrefix} from './publicPath.js'

describe('publicUrlPrefix', () => {
  const prev = process.env.BASE_PATH

  afterEach(() => {
    if (prev === undefined) delete process.env.BASE_PATH
    else process.env.BASE_PATH = prev
  })

  it('returns empty string for root', () => {
    process.env.BASE_PATH = '/'
    expect(publicUrlPrefix()).toBe('')
  })

  it('normalizes subdirectory paths', () => {
    process.env.BASE_PATH = '/umpire/'
    expect(publicUrlPrefix()).toBe('/umpire')
  })
})

describe('requestPublicPrefix', () => {
  const prev = process.env.BASE_PATH

  afterEach(() => {
    if (prev === undefined) delete process.env.BASE_PATH
    else process.env.BASE_PATH = prev
  })

  it('prefers X-Forwarded-Prefix over BASE_PATH', () => {
    process.env.BASE_PATH = '/umpire'
    expect(
      requestPublicPrefix({
        headers: {'x-forwarded-prefix': '/custom'},
      }),
    ).toBe('/custom')
  })

  it('falls back to BASE_PATH when header is absent', () => {
    process.env.BASE_PATH = '/umpire'
    expect(requestPublicPrefix({headers: {}})).toBe('/umpire')
  })

  it('returns empty for root deployment', () => {
    process.env.BASE_PATH = '/'
    expect(requestPublicPrefix({headers: {}})).toBe('')
  })
})
