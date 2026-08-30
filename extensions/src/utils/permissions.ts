import {browser} from 'wxt/browser'
import {hostPermissionPattern} from './storage'

/** HTTP and HTTPS are different extension origins; request both when one is configured. */
export function hostPermissionPatterns(baseUrl: string): string[] {
  const primary = hostPermissionPattern(baseUrl)
  if (!primary) return []

  const patterns = [primary]
  try {
    const u = new URL(baseUrl)
    const alt =
      u.protocol === 'http:'
        ? `https://${u.host}/*`
        : u.protocol === 'https:'
          ? `http://${u.host}/*`
          : null
    if (alt && !patterns.includes(alt)) patterns.push(alt)
  } catch {
    // ignore invalid URL
  }
  return patterns
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
