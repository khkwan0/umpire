export interface KeywordBodyConfig {
  keyword: string
  caseSensitive: boolean
}

export const defaultKeywordBodyConfig: KeywordBodyConfig = {
  keyword: 'ok',
  caseSensitive: false,
}

export function normalizeKeywordBodyConfig(input: unknown): KeywordBodyConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { keyword?, caseSensitive? }')
  }
  const row = input as Record<string, unknown>
  const keyword = String(row.keyword ?? '').trim()
  if (!keyword) throw new Error('keyword is required')
  const caseSensitive = Boolean(row.caseSensitive)
  return {keyword, caseSensitive}
}

export function resolveKeywordBodyConfig(input: unknown): KeywordBodyConfig {
  if (input === null || input === undefined)
    return {...defaultKeywordBodyConfig}
  return normalizeKeywordBodyConfig(input)
}
