import {
  getBrowserAuthStorage,
  parseAuthIdleTtlSeconds,
} from '../features/auth/index.ts'
import { createAuthRuntime } from '../features/auth/auth-runtime.ts'
import { appQueryClient } from './query-client.ts'
import { createAppRouter } from './router.tsx'

export const appAuthRuntime = createAuthRuntime({
  queryClient: appQueryClient,
  storage: getBrowserAuthStorage(),
  idleTtlSeconds: parseAuthIdleTtlSeconds(
    import.meta.env.VITE_AUTH_IDLE_TTL_SECONDS,
  ),
})

export const appRouter = createAppRouter({
  authSession: appAuthRuntime.session,
  queryClient: appQueryClient,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof appRouter
  }
}
