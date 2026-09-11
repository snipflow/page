import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthRuntime, useAuthSnapshot } from './auth-context.ts'
import { attachFunctionalSessionPresence } from './session-lifecycle.ts'

export function AuthGate() {
  const { session } = useAuthRuntime()
  const snapshot = useAuthSnapshot()

  useEffect(() => {
    if (snapshot.status === 'authenticated') {
      return attachFunctionalSessionPresence(session)
    }
  }, [session, snapshot.sessionId, snapshot.status])

  return snapshot.status === 'authenticated' ? <Outlet /> : null
}
