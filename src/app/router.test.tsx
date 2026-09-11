import { QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  type RouterHistory,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { createAppQueryClient } from './query-client.ts'
import { createAppRouter } from './router.tsx'

function renderRoute(path: string, history?: RouterHistory) {
  const queryClient = createAppQueryClient()
  const router = createAppRouter({
    history: history ?? createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}

describe('application routes', () => {
  it.each([
    ['/auth', '连接 Snipflow'],
    ['/send', '发送内容'],
    ['/receive', '接收内容'],
    ['/dashboard', '存储概览'],
  ])('renders %s directly', async (path, heading) => {
    const { queryClient, router } = renderRoute(path)

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible()

    queryClient.clear()
    router.history.destroy()
  })

  it('redirects the root route to authentication', async () => {
    const { queryClient, router } = renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/auth')

    queryClient.clear()
    router.history.destroy()
  })

  it('uses router history for back and forward navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/auth'] })
    const { queryClient, router } = renderRoute('/auth', history)
    await screen.findByRole('heading', { name: '连接 Snipflow' })

    await act(async () => {
      await router.navigate({ to: '/send' })
    })
    expect(
      await screen.findByRole('heading', { name: '发送内容' }),
    ).toBeVisible()

    act(() => history.back())
    expect(
      await screen.findByRole('heading', { name: '连接 Snipflow' }),
    ).toBeVisible()

    act(() => history.forward())
    expect(
      await screen.findByRole('heading', { name: '发送内容' }),
    ).toBeVisible()

    queryClient.clear()
    router.history.destroy()
  })
})
