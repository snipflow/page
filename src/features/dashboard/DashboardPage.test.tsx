import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { createAppQueryClient } from '../../app/query-client.ts'
import { API_TEST_ORIGIN, API_TEST_TOKEN } from '../../test/api-fixtures.ts'
import { MemoryAuthStorage } from '../../test/auth-test-utils.ts'
import { apiServer } from '../../test/msw-server.ts'
import { AuthRuntimeProvider } from '../auth/AuthRuntimeProvider.tsx'
import { createAuthRuntime } from '../auth/auth-runtime.ts'
import { DashboardPage } from './DashboardPage.tsx'

const FUTURE_EXPIRY = '2099-09-15T00:00:00.000Z'

function renderDashboard() {
  const queryClient = createAppQueryClient()
  const runtime = createAuthRuntime({
    baseUrl: API_TEST_ORIGIN,
    queryClient,
    storage: new MemoryAuthStorage(),
    idleTtlSeconds: 1_800,
    createSessionId: () => 'dashboard-session',
  })
  runtime.session.establishSession(API_TEST_TOKEN)
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthRuntimeProvider runtime={runtime}>
        <DashboardPage />
      </AuthRuntimeProvider>
    </QueryClientProvider>,
  )
  return { queryClient, runtime, unmount: view.unmount }
}

const activeHarnesses: ReturnType<typeof renderDashboard>[] = []

function mountDashboard() {
  const harness = renderDashboard()
  activeHarnesses.push(harness)
  return harness
}

afterEach(() => {
  for (const harness of activeHarnesses.splice(0)) {
    harness.unmount()
    harness.queryClient.clear()
  }
})

describe('dashboard snapshot workflow', () => {
  it('searches only loaded keys without requesting a server search or body', async () => {
    const user = userEvent.setup()
    let releaseSecondPage: (() => void) | undefined
    const secondPage = new Promise<void>((resolve) => {
      releaseSecondPage = resolve
    })
    const listRequests: string[] = []
    let statsRequests = 0
    let bodyRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        listRequests.push(cursor ?? 'first')
        if (cursor) {
          await secondPage
          return HttpResponse.json({
            items: [
              {
                key: 'alpha-lowercase',
                contentType: 'text/plain; charset=utf-8',
                size: 5,
                createdAt: '2026-09-14T00:00:00.000Z',
                expiresAt: FUTURE_EXPIRY,
              },
            ],
          })
        }
        return HttpResponse.json({
          items: [
            {
              key: 'Alpha-uppercase',
              contentType: 'application/json',
              size: 2,
              createdAt: '2026-09-15T00:00:00.000Z',
              expiresAt: null,
            },
          ],
          cursor: 'next-page',
        })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () => {
        statsRequests += 1
        return HttpResponse.json({
          count: 2,
          totalSize: 7,
          storageLimit: 1_024,
        })
      }),
      http.get(`${API_TEST_ORIGIN}/snip/:key`, ({ params }) => {
        bodyRequests += 1
        return new HttpResponse(String(params.key), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
    )

    mountDashboard()

    expect(
      await screen.findByRole('button', {
        name: '打开Alpha-uppercase详情',
      }),
    ).toBeVisible()
    expect(screen.getByText('已载入 1 项，索引继续获取中')).toBeVisible()
    expect(statsRequests).toBe(1)
    expect(bodyRequests).toBe(0)

    await user.type(screen.getByLabelText('搜索 Key，区分大小写'), 'alpha')
    expect(
      screen.queryByRole('button', { name: '打开Alpha-uppercase详情' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('匹配 0 项 · 当前已载入范围')).toBeVisible()
    expect(listRequests).toEqual(['first', 'next-page'])
    expect(bodyRequests).toBe(0)

    await act(async () => releaseSecondPage?.())
    expect(
      await screen.findByRole('button', { name: '打开alpha-lowercase详情' }),
    ).toBeVisible()
    expect(screen.getByText('匹配 1 项 · 完整索引')).toBeVisible()
    expect(listRequests).toEqual(['first', 'next-page'])
    expect(bodyRequests).toBe(0)

    await user.click(screen.getByRole('button', { name: '清空搜索' }))
    expect(
      screen.getByRole('button', { name: '打开Alpha-uppercase详情' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '打开alpha-lowercase详情' }),
    ).toBeVisible()
    expect(listRequests).toEqual(['first', 'next-page'])

    await user.type(screen.getByLabelText('搜索 Key，区分大小写'), 'alpha')
    await user.click(
      screen.getByRole('button', { name: '打开alpha-lowercase详情' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'alpha-lowercase' }),
    ).toBeVisible()
    await waitFor(() => expect(bodyRequests).toBe(1))
    expect(listRequests).toEqual(['first', 'next-page'])
  })

  it('keeps an expired item and re-reads its body only after an explicit open', async () => {
    const user = userEvent.setup()
    let listRequests = 0
    let statsRequests = 0
    let bodyRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listRequests += 1
        return HttpResponse.json({
          items: [
            {
              key: 'expired-visible-item',
              contentType: 'text/plain; charset=utf-8',
              size: 20,
              createdAt: '2020-09-14T00:00:00.000Z',
              expiresAt: '2020-09-15T00:00:00.000Z',
            },
          ],
        })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () => {
        statsRequests += 1
        return HttpResponse.json({
          count: 1,
          totalSize: 20,
          storageLimit: 1_024,
        })
      }),
      http.get(`${API_TEST_ORIGIN}/snip/:key`, () => {
        bodyRequests += 1
        return new HttpResponse('still available', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
    )

    mountDashboard()
    const item = await screen.findByRole('button', {
      name: '打开expired-visible-item详情',
    })
    expect(item).toHaveTextContent('已过期')
    expect(bodyRequests).toBe(0)

    await user.click(item)
    expect(await screen.findByText('still available')).toBeVisible()
    expect(bodyRequests).toBe(1)
    expect(listRequests).toBe(1)
    expect(statsRequests).toBe(1)
    expect(item).toHaveTextContent('已过期')
    expect(item).toBeInTheDocument()
  })

  it('keeps a removed open detail on the shared clock without refetching', async () => {
    const user = userEvent.setup()
    const expiresAt = new Date(Date.now() + 2_400).toISOString()
    let listRequests = 0
    let bodyRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listRequests += 1
        return HttpResponse.json({
          items:
            listRequests === 1
              ? [
                  {
                    key: 'removed-from-snapshot',
                    contentType: 'text/plain; charset=utf-8',
                    size: 13,
                    createdAt: '2026-09-15T00:00:00.000Z',
                    expiresAt,
                  },
                ]
              : [],
        })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json({
          count: 1,
          totalSize: 13,
          storageLimit: 1_024,
        }),
      ),
      http.get(`${API_TEST_ORIGIN}/snip/:key`, () => {
        bodyRequests += 1
        return new HttpResponse('retained body', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
    )

    mountDashboard()
    await user.click(
      await screen.findByRole('button', {
        name: '打开removed-from-snapshot详情',
      }),
    )
    expect(await screen.findByText('retained body')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '刷新存储快照' }))
    expect(await screen.findByText('当前没有 Snip')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'removed-from-snapshot' }),
    ).toBeVisible()

    await waitFor(() => expect(screen.getByText('已过期')).toBeVisible(), {
      timeout: 5_000,
    })
    expect(screen.queryByText('retained body')).not.toBeInTheDocument()
    expect(bodyRequests).toBe(1)
    expect(listRequests).toBe(2)
  }, 8_000)

  it('applies deletion locally, marks stats dirty, and focuses the next item', async () => {
    const user = userEvent.setup()
    let listRequests = 0
    let bodyRequests = 0
    let deleteRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listRequests += 1
        return HttpResponse.json({
          items: [
            {
              key: 'newer-item',
              contentType: 'text/plain; charset=utf-8',
              size: 10,
              createdAt: '2026-09-15T00:00:00.000Z',
              expiresAt: null,
              source: 'must-not-leak-from-list',
            },
            {
              key: 'older-item',
              contentType: 'application/octet-stream',
              size: 4,
              createdAt: '2026-09-14T00:00:00.000Z',
              expiresAt: null,
            },
          ],
        })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json({
          count: 2,
          totalSize: 14,
          storageLimit: 1_024,
        }),
      ),
      http.get(`${API_TEST_ORIGIN}/snip/:key`, ({ params }) => {
        bodyRequests += 1
        return new HttpResponse(`body:${String(params.key)}`, {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
      http.delete(`${API_TEST_ORIGIN}/snip/:key`, () => {
        deleteRequests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    mountDashboard()
    const first = await screen.findByRole('button', {
      name: '打开newer-item详情',
    })
    const next = screen.getByRole('button', { name: '打开older-item详情' })
    expect(listRequests).toBe(1)
    expect(bodyRequests).toBe(0)

    await user.click(first)
    expect(await screen.findByText('body:newer-item')).toBeVisible()
    expect(bodyRequests).toBe(1)
    expect(
      screen.queryByText('must-not-leak-from-list'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(deleteRequests).toBe(1))
    expect(
      screen.queryByRole('button', { name: '打开newer-item详情' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('newer-item 已删除')).toBeVisible()
    expect(screen.getByText('待刷新')).toBeVisible()
    await waitFor(() => expect(next).toHaveFocus())
    expect(listRequests).toBe(1)
  })

  it('retains a complete snapshot when a manual refresh fails', async () => {
    const user = userEvent.setup()
    let listRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listRequests += 1
        if (listRequests > 1) {
          return HttpResponse.json(
            { error: { code: 'UPSTREAM', message: 'Unavailable' } },
            { status: 503 },
          )
        }
        return HttpResponse.json({
          items: [
            {
              key: 'retained-item',
              contentType: 'application/pdf',
              filename: 'retained.pdf',
              size: 500,
              createdAt: '2026-09-15T00:00:00.000Z',
              expiresAt: null,
            },
          ],
        })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json({
          count: 1,
          totalSize: 500,
          storageLimit: 1_024,
        }),
      ),
    )

    mountDashboard()
    const item = await screen.findByRole('button', {
      name: '打开retained.pdf详情',
    })
    await screen.findByText('完整快照 · 1 项')

    await user.click(screen.getByRole('button', { name: '刷新存储快照' }))

    expect(
      await screen.findByText('索引读取失败，已保留可用条目。'),
    ).toBeVisible()
    expect(item).toBeVisible()
    expect(listRequests).toBe(2)
  })
})
