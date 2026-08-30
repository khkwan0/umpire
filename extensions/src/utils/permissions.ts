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

export async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  const patterns = hostPermissionPatterns(baseUrl)
  if (patterns.length === 0) return false

  if (await hasAllPatterns(patterns)) return true

  try {
    return await browser.permissions.request({origins: patterns})
  } catch {
    return false
  }
}

export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  return hasAllPatterns(hostPermissionPatterns(baseUrl))
}
