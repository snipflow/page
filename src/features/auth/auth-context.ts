import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AuthRuntime } from './auth-runtime.ts'

export const AuthRuntimeContext = createContext<AuthRuntime | null>(null)

export function useAuthRuntime() {
  const runtime = useContext(AuthRuntimeContext)
  if (!runtime) {
    throw new Error('AuthRuntimeProvider is missing')
  }
  return runtime
}

export function useAuthSnapshot() {
  const { session } = useAuthRuntime()
  return useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )
}
