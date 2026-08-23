import {browser} from 'wxt/browser'
import {hostPermissionPattern} from './storage'

export async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = hostPermissionPattern(baseUrl)
  if (!pattern) return false

  const already = await browser.permissions.contains({origins: [pattern]})
  if (already) return true

  try {
    return await browser.permissions.request({origins: [pattern]})
  } catch {
    return false
  }
}

export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = hostPermissionPattern(baseUrl)
  if (!pattern) return false
  return browser.permissions.contains({origins: [pattern]})
}
