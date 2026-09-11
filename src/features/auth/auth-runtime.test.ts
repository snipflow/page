// @vitest-environment node

import { QueryClient } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { API_TEST_ORIGIN } from '../../test/api-fixtures.ts'
import { MemoryAuthStorage } from '../../test/auth-test-utils.ts'
import { apiServer } from '../../test/msw-server.ts'
import { createAuthRuntime } from './auth-runtime.ts'

function createRuntime(fetchImplementation?: typeof fetch) {
  let sequence = 0
  const queryClient = new QueryClient()
  const runtime = createAuthRuntime({
    baseUrl: API_TEST_ORIGIN,
    queryClient,
    storage: new MemoryAuthStorage(),
    idleTtlSeconds: 1_800,
    createSessionId: () => `session-${++sequence}`,
    ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
  })
  return { queryClient, runtime }
}

describe('auth runtime coordination', () => {
  it('does not replace an existing session when candidate verification fails', async () => {
    const { runtime } = createRuntime()
    runtime.session.establishSession('still-valid-token')

    await expect(runtime.verifyToken('wrong-token')).rejects.toMatchObject({
      status: 401,
    })

    expect(runtime.session.getToken()).toBe('still-valid-token')
  })

  it('clears Query data when the current session ends', () => {
    const { queryClient, runtime } = createRuntime()
    runtime.session.establishSession('runtime-token')
    queryClient.setQueryData(['session', 'metadata'], { value: true })

    runtime.session.endSession()

    expect(queryClient.getQueryData(['session', 'metadata'])).toBeUndefined()
  })

  it('ignores a delayed 401 belonging to an older session', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const delayedFetch: typeof fetch = async () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve
      })
    const { runtime } = createRuntime(delayedFetch)
    runtime.session.establishSession('first-token')
    const oldRequest = runtime.api.stats()
    runtime.session.establishSession('second-token')

    resolveResponse?.(
      HttpResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      ),
    )
    await expect(oldRequest).rejects.toMatchObject({ status: 401 })
    expect(runtime.session.getToken()).toBe('second-token')
  })

  it('ends the current session when its own request receives 401', async () => {
    const { runtime } = createRuntime()
    runtime.session.establishSession('current-token')
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
          { status: 401 },
        ),
      ),
    )

    await expect(runtime.api.stats()).rejects.toMatchObject({ status: 401 })
    expect(runtime.session.isAuthenticated()).toBe(false)
  })
})
