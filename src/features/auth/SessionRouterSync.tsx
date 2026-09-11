import { useEffect } from 'react'
import type { AppRouter } from '../../app/router.tsx'
import { isFunctionalPath } from './auth-session.ts'
import { useAuthRuntime } from './auth-context.ts'

interface SessionRouterSyncProps {
  router: AppRouter
}

export function SessionRouterSync({ router }: SessionRouterSyncProps) {
  const { session } = useAuthRuntime()

  useEffect(
    () =>
      session.subscribe(() => {
        const snapshot = session.getSnapshot()
        const currentPath = router.state.location.pathname

        if (snapshot.status === 'anonymous' && isFunctionalPath(currentPath)) {
          session.rememberTarget(currentPath)
          void router.navigate({ to: '/auth', replace: true })
          return
        }
        if (snapshot.status === 'authenticated' && currentPath === '/auth') {
          void router.navigate({
            to: session.consumeTarget(),
            replace: true,
          })
          return
        }
        void router.invalidate()
      }),
    [router, session],
  )

  return null
}
