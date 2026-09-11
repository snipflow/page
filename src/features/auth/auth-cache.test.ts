import {
  DEFAULT_AUTH_IDLE_TTL_SECONDS,
  isCachedAuthExpired,
  isValidAuthToken,
  parseAuthIdleTtlSeconds,
  parseCachedAuthRecord,
  serializeCachedAuthRecord,
} from './auth-cache.ts'

describe('auth cache configuration', () => {
  it('uses the default, accepts explicit seconds, and supports no expiry', () => {
    expect(parseAuthIdleTtlSeconds(undefined)).toBe(
      DEFAULT_AUTH_IDLE_TTL_SECONDS,
    )
    expect(parseAuthIdleTtlSeconds('60')).toBe(60)
    expect(parseAuthIdleTtlSeconds('0')).toBe(0)
  })

  it.each(['-1', '1.5', 'NaN', '9007199254740992'])(
    'rejects invalid idle TTL %j',
    (value) => {
      expect(() => parseAuthIdleTtlSeconds(value)).toThrow(TypeError)
    },
  )
})

describe('auth cache records', () => {
  it('round-trips the only two persisted fields', () => {
    const value = serializeCachedAuthRecord({
      token: 'runtime-token',
      lastActiveAt: 1_000,
    })

    expect(parseCachedAuthRecord(value)).toEqual({
      token: 'runtime-token',
      lastActiveAt: 1_000,
    })
  })

  it.each([
    '',
    'not-json',
    '{}',
    '{"token":"","lastActiveAt":1}',
    '{"token":"value","lastActiveAt":-1}',
    '{"token":"value","lastActiveAt":1.5}',
  ])('rejects malformed cache value %j', (value) => {
    expect(parseCachedAuthRecord(value)).toBeNull()
  })

  it('rejects control characters without trimming valid token bytes', () => {
    expect(isValidAuthToken(' token with spaces ')).toBe(true)
    expect(isValidAuthToken('bad\ntoken')).toBe(false)
  })

  it('expires at the exact boundary and never expires when configured as zero', () => {
    const record = { token: 'token', lastActiveAt: 1_000 }

    expect(isCachedAuthExpired(record, 60_999, 60)).toBe(false)
    expect(isCachedAuthExpired(record, 61_000, 60)).toBe(true)
    expect(isCachedAuthExpired(record, Number.MAX_SAFE_INTEGER, 0)).toBe(false)
  })
})
