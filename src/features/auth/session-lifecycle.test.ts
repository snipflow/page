import { AUTH_STORAGE_KEY } from './auth-cache.ts'
import { AuthSession } from './auth-session.ts'
import {
  AUTH_RENEW_INTERVAL_MS,
  attachAuthStorageSync,
  attachFunctionalSessionPresence,
} from './session-lifecycle.ts'
import { MemoryAuthStorage } from '../../test/auth-test-utils.ts'

describe('active session presence', () => {
  afterEach(() => vi.useRealTimers())

  it('renews locally every 30 seconds and at page boundaries', () => {
    vi.useFakeTimers()
    let now = 1_000
    const storage = new MemoryAuthStorage()
    const session = new AuthSession({
      storage,
      idleTtlSeconds: 1,
      now: () => now,
      createSessionId: () => 'session-id',
    })
    session.establishSession('runtime-token')

    const detach = attachFunctionalSessionPresence(session)
    now = 31_000
    vi.advanceTimersByTime(AUTH_RENEW_INTERVAL_MS)
    expect(
      JSON.parse(storage.getItem(AUTH_STORAGE_KEY) ?? '').lastActiveAt,
    ).toBe(31_000)

    now = 40_000
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    expect(
      JSON.parse(storage.getItem(AUTH_STORAGE_KEY) ?? '').lastActiveAt,
    ).toBe(40_000)

    storage.removeItem(AUTH_STORAGE_KEY)
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
    expect(session.isAuthenticated()).toBe(false)
    detach()
  })
})

describe('cross-tab storage events', () => {
  it('ends the current session when another tab removes the cache', () => {
    const storage = new MemoryAuthStorage()
    const session = new AuthSession({
      storage,
      idleTtlSeconds: 1_800,
      createSessionId: () => 'session-id',
    })
    session.establishSession('runtime-token')
    const detach = attachAuthStorageSync(session)

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_STORAGE_KEY,
        newValue: null,
      }),
    )

    expect(session.isAuthenticated()).toBe(false)
    detach()
  })
})
