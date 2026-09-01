import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import {Platform} from 'react-native'

const SERVER_URL_KEY = 'umpire-server-url'
const SESSION_COOKIE_KEY = 'umpire-session-cookie'
const BEARER_TOKEN_KEY = 'umpire-bearer-token'
const CHAT_OWNER_KEY = 'umpire-agent-chat-owner'
const ACTIVE_CHAT_KEY = 'umpire-agent-active-chat'
const THEME_KEY = 'umpire-theme'

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key)
  }
  return SecureStore.getItemAsync(key)
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(SERVER_URL_KEY)
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ''))
}

export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_URL_KEY)
}

export async function getSessionCookie(): Promise<string | null> {
  return secureGet(SESSION_COOKIE_KEY)
}

export async function setSessionCookie(cookie: string): Promise<void> {
  await secureSet(SESSION_COOKIE_KEY, cookie)
}

export async function clearSessionCookie(): Promise<void> {
  await secureDelete(SESSION_COOKIE_KEY)
}

export async function getBearerToken(): Promise<string | null> {
  return secureGet(BEARER_TOKEN_KEY)
}

export async function setBearerToken(token: string): Promise<void> {
  await secureSet(BEARER_TOKEN_KEY, token)
}

export async function clearBearerToken(): Promise<void> {
  await secureDelete(BEARER_TOKEN_KEY)
}

export async function getChatOwnerKey(): Promise<string> {
  const existing = await secureGet(CHAT_OWNER_KEY)
  if (existing && existing.length >= 8) return existing
  const created = generateUuid()
  await secureSet(CHAT_OWNER_KEY, created)
  return created
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function getStoredActiveChatId(): Promise<string | null> {
  return secureGet(ACTIVE_CHAT_KEY)
}

export async function setStoredActiveChatId(id: string | null): Promise<void> {
  if (id) await secureSet(ACTIVE_CHAT_KEY, id)
  else await secureDelete(ACTIVE_CHAT_KEY)
}

export type ThemePreference = 'light' | 'dark' | 'system'

export async function getThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(THEME_KEY)
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export async function setThemePreference(theme: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme)
}

export function parseSetCookieHeader(header: string | null): string | null {
  if (!header) return null
  const match = header.match(/umpire_session=([^;]+)/)
  if (!match) return null
  return `umpire_session=${match[1]}`
}
