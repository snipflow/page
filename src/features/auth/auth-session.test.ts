import { AUTH_STORAGE_KEY } from './auth-cache.ts'
import { AuthSession } from './auth-session.ts'
import { MemoryAuthStorage } from '../../test/auth-test-utils.ts'

function createSession(options?: {
  idleTtlSeconds?: number
  now?: () => number
  storage?: MemoryAuthStorage | null
}) {
  let sequence = 0
  return new AuthSession({
    storage: options?.storage ?? new MemoryAuthStorage(),
    idleTtlSeconds: options?.idleTtlSeconds ?? 1_800,
    now: options?.now ?? (() => 10_000),
    createSessionId: () => `session-${++sequence}`,
  })
}

describe('auth session restoration', () => {
  it('restores an unexpired cached token into a new opaque session', () => {
    const storage = new MemoryAuthStorage()
    storage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: 'cached-token', lastActiveAt: 9_000 }),
    )

    const session = createSession({ storage })

    expect(session.getToken()).toBe('cached-token')
    expect(session.getSnapshot()).toEqual({
      status: 'authenticated',
      sessionId: 'session-1',
      persistence: 'local',
      storageAvailable: true,
    })
    expect(session.getSnapshot()).not.toHaveProperty('token')
  })

  it('clears expired and malformed cache values', () => {
    const expiredStorage = new MemoryAuthStorage()
    expiredStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: 'expired', lastActiveAt: 1_000 }),
    )
    const malformedStorage = new MemoryAuthStorage()
    malformedStorage.setItem(AUTH_STORAGE_KEY, '{bad-json')

    expect(
      createSession({
        storage: expiredStorage,
        idleTtlSeconds: 9,
      }).isAuthenticated(),
    ).toBe(false)
    expect(expiredStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(createSession({ storage: malformedStorage }).isAuthenticated()).toBe(
      false,
    )
    expect(malformedStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('restores an old cache when idle expiry is disabled', () => {
    const storage = new MemoryAuthStorage()
    storage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: 'permanent', lastActiveAt: 0 }),
    )

    expect(createSession({ storage, idleTtlSeconds: 0 }).getToken()).toBe(
      'permanent',
    )
  })
})

describe('auth session lifecycle', () => {
  it('persists a newly authenticated session and clears it on exit', () => {
    const storage = new MemoryAuthStorage()
    const session = createSession({ storage })
    const cleanup = vi.fn<() => void>()
    session.registerCleanup(cleanup)

    expect(session.establishSession('new-token')).toBe('local')
    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY) ?? '')).toEqual({
      token: 'new-token',
      lastActiveAt: 10_000,
    })

    session.endSession({ target: '/receive' })
    expect(cleanup).toHaveBeenCalledOnce()
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(session.getToken()).toBeNull()
    expect(session.consumeTarget()).toBe('/receive')
  })

  it('keeps an explicit memory-only session when storage writes fail', () => {
    const storage = new MemoryAuthStorage()
    storage.failWrites = true
    const session = createSession({ storage })

    expect(session.establishSession('memory-token')).toBe('memory')
    expect(session.getToken()).toBe('memory-token')
    expect(session.getSnapshot()).toMatchObject({
      status: 'authenticated',
      persistence: 'memory',
      storageAvailable: false,
    })
  })

  it('ignores an old session logout after credentials have changed', () => {
    const session = createSession()
    session.establishSession('first-token')
    const firstSessionId = session.getSessionId()
    session.establishSession('second-token')

    expect(firstSessionId).not.toBeNull()
    expect(session.endSessionIfCurrent(firstSessionId ?? '')).toBe(false)
    expect(session.getToken()).toBe('second-token')
  })

  it('does not recreate a cache removed by another tab during renewal', () => {
    const storage = new MemoryAuthStorage()
    const session = createSession({ storage })
    session.establishSession('runtime-token')
    storage.removeItem(AUTH_STORAGE_KEY)

    expect(session.touch()).toBe(false)
    expect(session.isAuthenticated()).toBe(false)
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('adopts a changed cross-tab token with a new session identity', () => {
    const storage = new MemoryAuthStorage()
    const session = createSession({ storage })
    const cleanup = vi.fn<() => void>()
    session.registerCleanup(cleanup)
    session.establishSession('first-token')
    const firstSessionId = session.getSessionId()

    session.handleStorageValue(
      JSON.stringify({ token: 'second-token', lastActiveAt: 10_000 }),
    )

    expect(cleanup).toHaveBeenCalledOnce()
    expect(session.getToken()).toBe('second-token')
    expect(session.getSessionId()).not.toBe(firstSessionId)
  })

  it('keeps session identity and resources for a same-token renewal', () => {
    const session = createSession()
    const cleanup = vi.fn<() => void>()
    session.registerCleanup(cleanup)
    session.establishSession('shared-token')
    const sessionId = session.getSessionId()

    session.handleStorageValue(
      JSON.stringify({ token: 'shared-token', lastActiveAt: 10_000 }),
    )

    expect(cleanup).not.toHaveBeenCalled()
    expect(session.getSessionId()).toBe(sessionId)
    expect(session.getToken()).toBe('shared-token')
  })
})
