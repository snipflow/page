import type { QueryClient } from '@tanstack/react-query'
import { createSnipApi, type SnipApi } from '../../api/index.ts'
import type { AuthResponse } from '../../domain/index.ts'
import type { AuthStorage } from './auth-cache.ts'
import { AuthSession, type CreateAuthSessionOptions } from './auth-session.ts'

export interface AuthRuntime {
  api: SnipApi
  session: AuthSession
  verifyToken(token: string, signal?: AbortSignal): Promise<AuthResponse>
}

export interface CreateAuthRuntimeOptions extends Omit<
  CreateAuthSessionOptions,
  'storage' | 'idleTtlSeconds'
> {
  baseUrl?: string
  fetch?: typeof fetch
  idleTtlSeconds: number
  queryClient: QueryClient
  storage: AuthStorage | null
}

export function createAuthRuntime({
  baseUrl,
  fetch: fetchImplementation,
  idleTtlSeconds,
  queryClient,
  storage,
  ...sessionOptions
}: CreateAuthRuntimeOptions): AuthRuntime {
  const session = new AuthSession({
    storage,
    idleTtlSeconds,
    ...sessionOptions,
  })
  const sharedOptions = {
    ...(baseUrl ? { baseUrl } : {}),
    ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
  }
  const api = createSnipApi({
    ...sharedOptions,
    getToken: session.getToken,
    getSessionId: session.getSessionId,
    onUnauthorized: (sessionId) => {
      if (sessionId) {
        session.endSessionIfCurrent(sessionId)
      }
    },
  })

  session.registerCleanup(() => {
    void queryClient.cancelQueries()
    queryClient.clear()
  })

  return {
    api,
    session,
    verifyToken(token, signal) {
      return createSnipApi({
        ...sharedOptions,
        getToken: () => token,
      }).authenticate(signal)
    },
  }
}
