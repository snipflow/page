import { useEffect } from 'react'
import type { AppRouter } from '../../app/router.tsx'
import { isFunctionalPath, isReceiveTarget } from './auth-session.ts'
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
          const target = session.consumeTarget()
          if (isReceiveTarget(target)) {
            void router.navigate({
              to: '/receive/$key',
              params: { key: target.slice('/receive/'.length) },
              replace: true,
            })
          } else {
            void router.navigate({ to: target, replace: true })
          }
          return
        }
        void router.invalidate()
      }),
    [router, session],
  )

  return null
}
