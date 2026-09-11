export const AUTH_STORAGE_KEY = 'snipflow.auth'
export const DEFAULT_AUTH_IDLE_TTL_SECONDS = 1_800

export interface AuthStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

export interface CachedAuthRecord {
  token: string
  lastActiveAt: number
}

function hasControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })
}

export function isValidAuthToken(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && !hasControlCharacter(value)
  )
}

export function parseAuthIdleTtlSeconds(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_AUTH_IDLE_TTL_SECONDS
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError(
      'VITE_AUTH_IDLE_TTL_SECONDS must be a non-negative safe integer',
    )
  }
  return parsed
}

export function parseCachedAuthRecord(value: string): CachedAuthRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('token' in parsed) ||
    !isValidAuthToken(parsed.token) ||
    !('lastActiveAt' in parsed) ||
    typeof parsed.lastActiveAt !== 'number' ||
    !Number.isSafeInteger(parsed.lastActiveAt) ||
    parsed.lastActiveAt < 0
  ) {
    return null
  }

  return {
    token: parsed.token,
    lastActiveAt: parsed.lastActiveAt,
  }
}

export function serializeCachedAuthRecord(record: CachedAuthRecord): string {
  return JSON.stringify(record)
}

export function isCachedAuthExpired(
  record: CachedAuthRecord,
  now: number,
  idleTtlSeconds: number,
) {
  if (idleTtlSeconds === 0) {
    return false
  }
  return now - record.lastActiveAt >= idleTtlSeconds * 1_000
}

export function getBrowserAuthStorage(): AuthStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
