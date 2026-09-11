import { AUTH_STORAGE_KEY } from './auth-cache.ts'
import type { AuthSession } from './auth-session.ts'

export const AUTH_RENEW_INTERVAL_MS = 30_000

export function attachAuthStorageSync(
  session: AuthSession,
  target: Window = window,
) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_STORAGE_KEY) {
      session.handleStorageValue(event.newValue)
    }
  }
  target.addEventListener('storage', handleStorage)
  return () => target.removeEventListener('storage', handleStorage)
}

export function attachFunctionalSessionPresence(
  session: AuthSession,
  target: Window = window,
) {
  session.touch()
  const interval = target.setInterval(
    () => session.touch(),
    AUTH_RENEW_INTERVAL_MS,
  )
  const handlePageBoundary = () => session.touch()

  target.addEventListener('pagehide', handlePageBoundary)
  target.addEventListener('pageshow', handlePageBoundary)

  return () => {
    target.clearInterval(interval)
    target.removeEventListener('pagehide', handlePageBoundary)
    target.removeEventListener('pageshow', handlePageBoundary)
  }
}
