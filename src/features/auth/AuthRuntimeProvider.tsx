import { useEffect, type ReactNode } from 'react'
import type { AuthRuntime } from './auth-runtime.ts'
import { AuthRuntimeContext } from './auth-context.ts'
import { attachAuthStorageSync } from './session-lifecycle.ts'

interface AuthRuntimeProviderProps {
  children: ReactNode
  runtime: AuthRuntime
}

export function AuthRuntimeProvider({
  children,
  runtime,
}: AuthRuntimeProviderProps) {
  useEffect(() => attachAuthStorageSync(runtime.session), [runtime.session])

  return (
    <AuthRuntimeContext.Provider value={runtime}>
      {children}
    </AuthRuntimeContext.Provider>
  )
}
