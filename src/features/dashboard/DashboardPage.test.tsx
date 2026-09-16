import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('dashboard snapshot workflow', () => {
  it('reveals one measured viewport at a time without narrowing local search', async () => {
    const user = userEvent.setup()
    const observers: MockIntersectionObserver[] = []

    class MockIntersectionObserver {
      readonly root = null
      readonly rootMargin = '0px'
      readonly thresholds = [0]
      private readonly callback: IntersectionObserverCallback
      private target: Element | null = null

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        observers.push(this)
      }

      disconnect() {
        this.target = null
      }

      observe(target: Element) {
        this.target = target
      }

      takeRecords() {
        return []
      }

      isObserving() {
        return this.target !== null
      }

      unobserve(target: Element) {
        if (this.target === target) this.target = null
      }

      intersect() {
        if (!this.target) throw new Error('No reveal sentinel is observed')
        this.callback(
          [
            {
              isIntersecting: true,
              target: this.target,
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        )
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const height = this.classList.contains('dashboard-flow')
          ? this.children.length * 200
          : 0
        return {
          bottom: height,
          height,
          left: 0,
          right: 1_000,
          top: 0,
          width: 1_000,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      },
    )

    const items = Array.from({ length: 12 }, (_, index) => ({
      key: `lazy-item-${String(index + 1).padStart(2, '0')}`,
      contentType: 'text/plain',
      size: index + 1,
      createdAt: new Date(
        Date.UTC(2026, 8, 15, 0, 0, 12 - index),
      ).toISOString(),
      expiresAt: null,
    }))
    let listRequests = 0
    let bodyRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listRequests += 1
        return HttpResponse.json({ items })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () =>
        HttpResponse.json({
          count: items.length,
          totalSize: items.reduce((total, item) => total + item.size, 0),
          storageLimit: 1_024,
        }),
      ),
      http.get(`${API_TEST_ORIGIN}/snip/:key`, () => {
        bodyRequests += 1
        return new HttpResponse('body')
      }),
    )

    mountDashboard()

    await screen.findByText('完整快照 · 12 项')
    await waitFor(() =>
      expect(document.querySelectorAll('.dashboard-flow__item')).toHaveLength(
        4,
      ),
    )
    expect(await screen.findByText('已显示 4 项，共 12 项')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '打开lazy-item-12详情' }),
    ).not.toBeInTheDocument()

    await user.type(
      screen.getByLabelText('搜索 Key，区分大小写'),
      'lazy-item-12',
    )
    expect(
      screen.getByRole('button', { name: '打开lazy-item-12详情' }),
    ).toBeVisible()
    expect(screen.getByText('匹配 1 项 · 完整索引')).toBeVisible()
    expect(listRequests).toBe(1)
    expect(bodyRequests).toBe(0)

    await user.click(screen.getByRole('button', { name: '清空搜索' }))
    await waitFor(() =>
      expect(document.querySelectorAll('.dashboard-flow__item')).toHaveLength(
        4,
      ),
    )

    await waitFor(() => expect(observers.at(-1)?.isObserving()).toBe(true))
    const firstObserverCount = observers.length
    act(() => observers.at(-1)!.intersect())
    await waitFor(() =>
      expect(document.querySelectorAll('.dashboard-flow__item')).toHaveLength(
        8,
      ),
    )
    expect(await screen.findByText('已显示 8 项，共 12 项')).toBeInTheDocument()

    await waitFor(() =>
      expect(observers.length).toBeGreaterThan(firstObserverCount),
    )
    await waitFor(() => expect(observers.at(-1)?.isObserving()).toBe(true))
    act(() => observers.at(-1)!.intersect())
    await waitFor(() =>
      expect(document.querySelectorAll('.dashboard-flow__item')).toHaveLength(
        12,
      ),
    )
    expect(await screen.findByText('已显示全部 12 项')).toBeInTheDocument()
    expect(listRequests).toBe(1)
    expect(bodyRequests).toBe(0)
  })

  it('explains why the stats snapshot can differ from the current index', async () => {
    const user = userEvent.setup()

    mountDashboard()
    const helpButton = await screen.findByRole('button', {
      name: '查看统计快照说明',
    })

    await user.click(helpButton)

    expect(
      screen.getByRole('heading', { name: '统计快照仅供参考' }),
    ).toBeVisible()
    expect(
      screen.getByText(/过期对象的清理和统计更新可能存在延迟/),
    ).toBeVisible()
    expect(screen.getByText(/请仅将统计快照作为容量参考/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: '关闭统计快照说明' }))
    await waitFor(() => expect(helpButton).toHaveFocus())
  })

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
      await screen.findByRole('button', { name: '打开alpha-lowercase详情' }),
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
    expect(item).toHaveTextContent('expired-visible-item')
    expect(bodyRequests).toBe(0)

    await user.click(item)
    expect(await screen.findByText('still available')).toBeVisible()
    expect(bodyRequests).toBe(1)
    expect(listRequests).toBe(1)
    expect(statsRequests).toBe(1)
    expect(item).toHaveTextContent('expired-visible-item')
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

    await waitFor(
      () => expect(screen.getByText('已过期', { exact: true })).toBeVisible(),
      {
        timeout: 5_000,
      },
    )
    expect(screen.queryByText('retained body')).not.toBeInTheDocument()
    expect(bodyRequests).toBe(1)
    expect(listRequests).toBe(2)
  }, 8_000)

  it('applies deletion locally, refreshes stats, and focuses the next item', async () => {
    const user = userEvent.setup()
    let listRequests = 0
    let statsRequests = 0
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
      http.get(`${API_TEST_ORIGIN}/stats`, () => {
        statsRequests += 1
        return HttpResponse.json({
          count: statsRequests === 1 ? 2 : 1,
          totalSize: statsRequests === 1 ? 14 : 4,
          storageLimit: 1_024,
        })
      }),
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
    const next = await screen.findByRole('button', {
      name: '打开older-item详情',
    })
    expect(listRequests).toBe(1)
    expect(bodyRequests).toBe(0)
    const summary = screen.getByRole('region', { name: '存储统计' })
    expect(within(summary).getByText('2')).toBeVisible()
    expect(within(summary).getByText('14 B')).toBeVisible()

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
    await waitFor(() => expect(statsRequests).toBe(2))
    expect(screen.queryByText('待刷新')).not.toBeInTheDocument()
    expect(within(summary).getByText('1')).toBeVisible()
    expect(within(summary).getByText('4 B')).toBeVisible()
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

  it('offers a compact retry control after stats and index failures', async () => {
    const user = userEvent.setup()
    let listRequests = 0
    let statsRequests = 0

    apiServer.use(
      http.get(`${API_TEST_ORIGIN}/snip`, () => {
        listRequests += 1
        if (listRequests === 2) {
          return HttpResponse.json(
            { error: { code: 'LIST_DOWN', message: 'Unavailable' } },
            { status: 503 },
          )
        }
        return HttpResponse.json({
          items: [
            {
              key: 'retryable-item',
              contentType: 'text/plain',
              size: 12,
              createdAt: '2026-09-15T00:00:00.000Z',
              expiresAt: null,
            },
          ],
        })
      }),
      http.get(`${API_TEST_ORIGIN}/stats`, () => {
        statsRequests += 1
        if (statsRequests === 2) {
          return HttpResponse.json(
            { error: { code: 'STATS_DOWN', message: 'Unavailable' } },
            { status: 503 },
          )
        }
        return HttpResponse.json({
          count: 1,
          totalSize: 12,
          storageLimit: 1_024,
        })
      }),
    )

    mountDashboard()
    await screen.findByRole('button', {
      name: '打开retryable-item详情',
    })
    await user.click(screen.getByRole('button', { name: '刷新存储快照' }))

    expect(
      await screen.findByText('索引读取失败，已保留可用条目。'),
    ).toBeVisible()
    expect(screen.getByText('刷新失败')).toBeVisible()
    expect(screen.getByRole('button', { name: '重新刷新索引' })).toBeVisible()
    expect(screen.getByRole('button', { name: '重新刷新统计' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '重新刷新统计' }))
    await waitFor(() =>
      expect(screen.getByText('完整快照 · 1 项')).toBeVisible(),
    )
    expect(listRequests).toBe(2)
    expect(statsRequests).toBe(3)
  })
})
