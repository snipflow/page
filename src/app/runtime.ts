import {
  getBrowserAuthStorage,
  parseAuthIdleTtlSeconds,
} from '../features/auth/index.ts'
import { createAuthRuntime } from '../features/auth/auth-runtime.ts'
import { appQueryClient } from './query-client.ts'
import { createAppRouter } from './router.tsx'

const apiOrigin = import.meta.env.PROD
  ? import.meta.env.VITE_SNIPFLOW_API_ORIGIN?.trim()
  : undefined

export const appAuthRuntime = createAuthRuntime({
  ...(apiOrigin ? { baseUrl: apiOrigin } : {}),
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
