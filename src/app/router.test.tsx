import { QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  type RouterHistory,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { AuthRuntimeProvider } from '../features/auth/AuthRuntimeProvider.tsx'
import { createAuthRuntime } from '../features/auth/auth-runtime.ts'
import { SessionRouterSync } from '../features/auth/SessionRouterSync.tsx'
import { AUTH_STORAGE_KEY } from '../features/auth/auth-cache.ts'
import { API_TEST_ORIGIN, API_TEST_TOKEN } from '../test/api-fixtures.ts'
import { MemoryAuthStorage } from '../test/auth-test-utils.ts'
import { apiServer } from '../test/msw-server.ts'
import { createAppQueryClient } from './query-client.ts'
import { createAppRouter } from './router.tsx'

function renderRoute(
  path: string,
  options?: {
    authenticated?: boolean
    fetch?: typeof fetch
    history?: RouterHistory
    storage?: MemoryAuthStorage | null
  },
) {
  const queryClient = createAppQueryClient()
  const storage =
    options && 'storage' in options
      ? (options.storage ?? null)
      : new MemoryAuthStorage()
  let sessionSequence = 0
  const runtime = createAuthRuntime({
    baseUrl: API_TEST_ORIGIN,
    queryClient,
    storage,
    idleTtlSeconds: 1_800,
    createSessionId: () => `router-session-${++sessionSequence}`,
    ...(options?.fetch ? { fetch: options.fetch } : {}),
  })
  if (options?.authenticated) {
    runtime.session.establishSession(API_TEST_TOKEN)
  }
  const router = createAppRouter({
    authSession: runtime.session,
    history:
      options?.history ?? createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  })

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthRuntimeProvider runtime={runtime}>
        <SessionRouterSync router={router} />
        <RouterProvider router={router} />
      </AuthRuntimeProvider>
    </QueryClientProvider>,
  )

  return { queryClient, router, runtime, storage, unmount: view.unmount }
}

function destroyHarness(harness: ReturnType<typeof renderRoute>) {
  harness.unmount()
  harness.queryClient.clear()
  harness.router.history.destroy()
}

describe('authentication routes', () => {
  it('renders authentication directly and redirects an anonymous root', async () => {
    const direct = renderRoute('/auth')
    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    destroyHarness(direct)

    const root = renderRoute('/')
    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    expect(root.router.state.location.pathname).toBe('/auth')
    destroyHarness(root)
  })

  it.each([
    ['/send', '发送'],
    ['/receive', '接收'],
    ['/dashboard', '存储概览'],
  ] as const)(
    'restores the original target after authenticating from %s',
    async (path, heading) => {
      const harness = renderRoute(path)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: '连接 Snipflow' })

      await user.type(screen.getByLabelText('访问令牌'), API_TEST_TOKEN)
      await user.click(screen.getByRole('button', { name: '验证并继续' }))

      expect(
        await screen.findByRole('heading', { name: heading }),
      ).toBeVisible()
      expect(harness.router.state.location.pathname).toBe(path)
      expect(harness.runtime.session.isAuthenticated()).toBe(true)
      expect(harness.storage?.getItem(AUTH_STORAGE_KEY)).not.toBeNull()
      destroyHarness(harness)
    },
  )

  it('keeps an invalid token in the form without creating a session', async () => {
    const harness = renderRoute('/send')
    const user = userEvent.setup()
    const input = await screen.findByLabelText('访问令牌')

    await user.type(input, 'incorrect-token')
    await user.click(screen.getByRole('button', { name: '验证并继续' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('令牌无效')
    expect(input).toHaveValue('incorrect-token')
    expect(harness.runtime.session.isAuthenticated()).toBe(false)
    expect(harness.storage?.getItem(AUTH_STORAGE_KEY)).toBeNull()
    destroyHarness(harness)
  })

  it('keeps the token input and cache intact after a network failure', async () => {
    const harness = renderRoute('/receive')
    const user = userEvent.setup()
    const input = await screen.findByLabelText('访问令牌')
    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/health/auth`, () => HttpResponse.error()),
    )

    await user.type(input, API_TEST_TOKEN)
    await user.click(screen.getByRole('button', { name: '验证并继续' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('无法连接服务')
    expect(input).toHaveValue(API_TEST_TOKEN)
    expect(harness.runtime.session.isAuthenticated()).toBe(false)
    expect(harness.storage?.getItem(AUTH_STORAGE_KEY)).toBeNull()
    destroyHarness(harness)
  })

  it('prevents duplicate authentication submissions while one is pending', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const harness = renderRoute('/send', { fetch: fetchImplementation })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('访问令牌'), API_TEST_TOKEN)

    const submit = screen.getByRole('button', { name: '验证并继续' })
    await user.click(submit)
    expect(submit).toBeDisabled()
    await user.click(submit)
    expect(fetchImplementation).toHaveBeenCalledOnce()

    resolveResponse?.(
      HttpResponse.json({ ok: true, authed: true }, { status: 200 }),
    )
    expect(await screen.findByRole('heading', { name: '发送' })).toBeVisible()
    destroyHarness(harness)
  })

  it('reports and maintains a memory-only session when storage is unavailable', async () => {
    const harness = renderRoute('/send', { storage: null })
    const user = userEvent.setup()

    expect(
      await screen.findByText('浏览器存储不可用，验证后仅保持当前页面会话。'),
    ).toBeVisible()
    await user.type(screen.getByLabelText('访问令牌'), API_TEST_TOKEN)
    await user.click(screen.getByRole('button', { name: '验证并继续' }))

    expect(await screen.findByText('仅当前页面')).toBeVisible()
    expect(harness.runtime.session.getSnapshot().persistence).toBe('memory')
    destroyHarness(harness)
  })

  it.each([
    ['/send', '发送'],
    ['/receive', '接收'],
    ['/dashboard', '存储概览'],
  ] as const)(
    'opens cached functional route %s without a handshake',
    async (path, heading) => {
      const harness = renderRoute(path, { authenticated: true })

      expect(
        await screen.findByRole('heading', { name: heading }),
      ).toBeVisible()
      expect(harness.router.state.location.pathname).toBe(path)
      destroyHarness(harness)
    },
  )
})

describe('authenticated navigation', () => {
  it('switches only between send and receive using direction controls', async () => {
    const harness = renderRoute('/send', { authenticated: true })
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: '发送' })

    await user.click(screen.getByRole('button', { name: '前往接收' }))
    expect(await screen.findByRole('heading', { name: '接收' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '前往发送' }))
    expect(await screen.findByRole('heading', { name: '发送' })).toBeVisible()
    destroyHarness(harness)
  })

  it('keeps dashboard outside the transfer switch sequence', async () => {
    const harness = renderRoute('/dashboard', { authenticated: true })
    await screen.findByRole('heading', { name: '存储概览' })

    expect(
      screen.queryByRole('button', { name: /前往发送|前往接收/ }),
    ).not.toBeInTheDocument()
    destroyHarness(harness)
  })

  it('clears local credentials and returns to auth on explicit exit', async () => {
    const harness = renderRoute('/receive', { authenticated: true })
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: '接收' })

    await user.click(screen.getByRole('button', { name: '退出' }))

    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    expect(harness.storage?.getItem(AUTH_STORAGE_KEY)).toBeNull()
    destroyHarness(harness)
  })

  it('uses router history for back and forward navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/send'] })
    const harness = renderRoute('/send', { authenticated: true, history })
    await screen.findByRole('heading', { name: '发送' })

    await act(async () => {
      await harness.router.navigate({ to: '/receive' })
    })
    expect(await screen.findByRole('heading', { name: '接收' })).toBeVisible()

    act(() => history.back())
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '发送' })).toBeVisible(),
    )

    act(() => history.forward())
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '接收' })).toBeVisible(),
    )
    destroyHarness(harness)
  })

  it('restores the current target after a cross-tab logout and login', async () => {
    const harness = renderRoute('/dashboard', { authenticated: true })
    await screen.findByRole('heading', { name: '存储概览' })

    act(() => harness.runtime.session.handleStorageValue(null))
    await screen.findByRole('heading', { name: '连接 Snipflow' })
    act(() =>
      harness.runtime.session.handleStorageValue(
        JSON.stringify({ token: API_TEST_TOKEN, lastActiveAt: Date.now() }),
      ),
    )

    expect(
      await screen.findByRole('heading', { name: '存储概览' }),
    ).toBeVisible()
    destroyHarness(harness)
  })
})
