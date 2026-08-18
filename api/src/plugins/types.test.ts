import { healthFromDb, healthToDb } from './types.js'

describe('health encoding', () => {
  it('round-trips up, down, and partial', () => {
    expect(healthFromDb(healthToDb('up'))).toBe('up')
    expect(healthFromDb(healthToDb('down'))).toBe('down')
    expect(healthFromDb(healthToDb('partial'))).toBe('partial')
  })

  it('maps nullish DB values to no known health', () => {
    expect(healthFromDb(null)).toBeNull()
    expect(healthFromDb(undefined)).toBeNull()
  })

  it('treats any other numeric value as down', () => {
    expect(healthFromDb(0)).toBe('down')
    expect(healthFromDb(3)).toBe('down')
    expect(healthFromDb(-1)).toBe('down')
  })
})
