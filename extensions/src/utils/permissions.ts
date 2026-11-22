import {browser} from 'wxt/browser'
import {hostPermissionPattern} from './storage'

export function hostPermissionPatterns(baseUrl: string): string[] {
  const pattern = hostPermissionPattern(baseUrl)
  return pattern ? [pattern] : []
}

async function hasAllPatterns(patterns: string[]): Promise<boolean> {
  if (patterns.length === 0) return false
  return browser.permissions.contains({origins: patterns})
}

/**
 * Ask for the origin immediately. Call this from a click handler before any
 * await — Chrome drops the user gesture after the first yield, and then
 * permissions.request() returns false without a prompt.
 * Resolves true when the origin is already granted.
 */
export function requestHostPermission(baseUrl: string): Promise<boolean> {
  const patterns = hostPermissionPatterns(baseUrl)
  if (patterns.length === 0) return Promise.resolve(false)
  return Promise.resolve(browser.permissions.request({origins: patterns})).catch(
    () => false,
  )
}

export async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  const patterns = hostPermissionPatterns(baseUrl)
  if (patterns.length === 0) return false
  if (await hasAllPatterns(patterns)) return true
  return requestHostPermission(baseUrl)
}

export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  return hasAllPatterns(hostPermissionPatterns(baseUrl))
}
