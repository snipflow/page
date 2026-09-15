import { QueryClient } from '@tanstack/react-query'
import type { SnipApi } from '../api/index.ts'
import type { SnipIndex, StatsResponse } from '../domain/index.ts'
import { applySnipDelete, applySnipUpsert } from './cache-consistency.ts'
import { snipSnapshotQueryKey, snipStatsQueryKey } from './query-keys.ts'
import {
  cancelSessionCacheLoads,
  loadSnipSnapshot,
  loadSnipStats,
  type SnipSnapshot,
  type SnipStatsSnapshot,
} from './snip-snapshot.ts'

const CREATED_AT = '2026-09-15T00:00:00.000Z'

function index(key: string, size = 1): SnipIndex {
  return {
    key,
    contentType: 'text/plain',
    size,
    createdAt: CREATED_AT,
    expiresAt: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function makeApi(options: {
  list?: SnipApi['list']
  stats?: SnipApi['stats']
}): SnipApi {
  return {
    authenticate: vi.fn<SnipApi['authenticate']>(),
    create: vi.fn<SnipApi['create']>(),
    delete: vi.fn<SnipApi['delete']>(),
    health: vi.fn<SnipApi['health']>(),
    list: options.list ?? vi.fn<SnipApi['list']>(),
    read: vi.fn<SnipApi['read']>(),
    stats: options.stats ?? vi.fn<SnipApi['stats']>(),
  }
}

describe('snip snapshot loading', () => {
  it('loads every page, de-duplicates by key, and publishes completion once', async () => {
    const queryClient = new QueryClient()
    const list = vi.fn<SnipApi['list']>(async (cursor) =>
      cursor
        ? { items: [index('same', 2), index('second')], cursor: undefined }
        : { items: [index('first'), index('same', 1)], cursor: 'next' },
    )

    const result = await loadSnipSnapshot({
      api: makeApi({ list }),
      queryClient,
      sessionId: 'session-a',
      now: () => 123,
    })

    expect(list.mock.calls.map(([cursor]) => cursor)).toEqual([
      undefined,
      'next',
    ])
    expect(result).toMatchObject({
      complete: true,
      failure: null,
      nextCursor: null,
      snapshotAt: 123,
    })
    expect(result?.items.map(({ key, size }) => [key, size])).toEqual([
      ['first', 1],
      ['same', 2],
      ['second', 1],
    ])
  })

  it('progressively publishes fetched pages during the initial load', async () => {
    const queryClient = new QueryClient()
    const secondPage = deferred<{ items: SnipIndex[] }>()
    let request = 0
    const loading = loadSnipSnapshot({
      api: makeApi({
        list: vi.fn<SnipApi['list']>(async () =>
          request++ === 0
            ? { items: [index('first-page')], cursor: 'next' }
            : secondPage.promise,
        ),
      }),
      queryClient,
      sessionId: 'session-progressive',
    })

    await vi.waitFor(() =>
      expect(
        queryClient.getQueryData<SnipSnapshot>(
          snipSnapshotQueryKey('session-progressive'),
        ),
      ).toMatchObject({
        items: [index('first-page')],
        complete: false,
        nextCursor: 'next',
        refreshState: 'loading',
      }),
    )
    secondPage.resolve({ items: [index('second-page')] })

    await expect(loading).resolves.toMatchObject({
      complete: true,
      items: [index('first-page'), index('second-page')],
    })
  })

  it('stops a repeated cursor without presenting an incomplete index as complete', async () => {
    const queryClient = new QueryClient()
    const list = vi.fn<SnipApi['list']>(async () => ({
      items: [index('known')],
      cursor: 'loop',
    }))

    const result = await loadSnipSnapshot({
      api: makeApi({ list }),
      queryClient,
      sessionId: 'session-loop',
    })

    expect(list).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      complete: false,
      failure: 'cursor-loop',
      nextCursor: 'loop',
      refreshState: 'failed',
    })
  })

  it('marks an explicitly cancelled initial load as incomplete', async () => {
    const queryClient = new QueryClient()
    const controller = new AbortController()
    const list = vi.fn<SnipApi['list']>(
      (_cursor, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const loading = loadSnipSnapshot({
      api: makeApi({ list }),
      queryClient,
      sessionId: 'session-cancel',
      signal: controller.signal,
    })

    controller.abort()

    await expect(loading).resolves.toMatchObject({
      complete: false,
      refreshState: 'failed',
      failure: 'cancelled',
    })
  })

  it('retains the old complete snapshot when a refresh fails', async () => {
    const queryClient = new QueryClient()
    const queryKey = snipSnapshotQueryKey('session-refresh')
    const oldSnapshot: SnipSnapshot = {
      items: [index('old')],
      complete: true,
      nextCursor: null,
      generation: 1,
      snapshotAt: 100,
      refreshState: 'idle',
      failure: null,
    }
    queryClient.setQueryData(queryKey, oldSnapshot)

    await loadSnipSnapshot({
      api: makeApi({
        list: vi.fn<SnipApi['list']>(async () =>
          Promise.reject(new Error('offline')),
        ),
      }),
      queryClient,
      sessionId: 'session-refresh',
    })

    expect(queryClient.getQueryData<SnipSnapshot>(queryKey)).toMatchObject({
      items: oldSnapshot.items,
      complete: true,
      snapshotAt: 100,
      refreshState: 'failed',
      failure: 'request-failed',
    })
  })

  it('replays creates, overwrites, and deletes completed during a refresh', async () => {
    const queryClient = new QueryClient()
    const sessionId = 'session-overlay'
    queryClient.setQueryData<SnipSnapshot>(snipSnapshotQueryKey(sessionId), {
      items: [index('delete-me'), index('overwrite-me', 1)],
      complete: true,
      nextCursor: null,
      generation: 1,
      snapshotAt: 100,
      refreshState: 'idle',
      failure: null,
    })
    const page = deferred<{ items: SnipIndex[] }>()
    const loading = loadSnipSnapshot({
      api: makeApi({ list: vi.fn<SnipApi['list']>(() => page.promise) }),
      queryClient,
      sessionId,
      now: () => 200,
    })

    applySnipDelete(queryClient, sessionId, sessionId, 'delete-me')
    applySnipUpsert(queryClient, sessionId, sessionId, {
      ...index('overwrite-me', 20),
      source: 'page',
    })
    applySnipUpsert(queryClient, sessionId, sessionId, {
      ...index('created-during-refresh', 3),
      source: 'page',
    })
    page.resolve({
      items: [index('delete-me'), index('overwrite-me', 1)],
    })

    const result = await loading
    expect(result?.items.map(({ key, size }) => [key, size])).toEqual([
      ['overwrite-me', 20],
      ['created-during-refresh', 3],
    ])
  })

  it('lets only the newest generation publish during repeated refreshes', async () => {
    const queryClient = new QueryClient()
    const first = deferred<{ items: SnipIndex[] }>()
    const second = deferred<{ items: SnipIndex[] }>()
    let request = 0
    const list = vi.fn<SnipApi['list']>(() =>
      request++ === 0 ? first.promise : second.promise,
    )
    const api = makeApi({ list })

    const staleLoad = loadSnipSnapshot({
      api,
      queryClient,
      sessionId: 'session-generation',
    })
    const currentLoad = loadSnipSnapshot({
      api,
      queryClient,
      sessionId: 'session-generation',
    })
    second.resolve({ items: [index('new')] })
    await currentLoad
    first.resolve({ items: [index('stale')] })

    await expect(staleLoad).resolves.toBeUndefined()
    expect(
      queryClient
        .getQueryData<SnipSnapshot>(snipSnapshotQueryKey('session-generation'))
        ?.items.map((item) => item.key),
    ).toEqual(['new'])
  })

  it('does not restore a late response after its session has ended', async () => {
    const queryClient = new QueryClient()
    const page = deferred<{ items: SnipIndex[] }>()
    const loading = loadSnipSnapshot({
      api: makeApi({ list: vi.fn<SnipApi['list']>(() => page.promise) }),
      queryClient,
      sessionId: 'old-session',
    })

    cancelSessionCacheLoads(queryClient, 'old-session')
    queryClient.clear()
    page.resolve({ items: [index('late')] })

    await expect(loading).resolves.toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })
})

describe('stats snapshots', () => {
  it('preserves values and stays dirty when a write completes during refresh', async () => {
    const queryClient = new QueryClient()
    const sessionId = 'stats-session'
    const stats = deferred<StatsResponse>()
    queryClient.setQueryData<SnipStatsSnapshot>(snipStatsQueryKey(sessionId), {
      value: { count: 4, totalSize: 40, storageLimit: 100 },
      snapshotAt: 10,
      dirty: false,
      refreshState: 'idle',
    })
    const loading = loadSnipStats({
      api: makeApi({ stats: vi.fn<SnipApi['stats']>(() => stats.promise) }),
      queryClient,
      sessionId,
      now: () => 20,
    })

    applySnipUpsert(queryClient, sessionId, sessionId, {
      ...index('new-object'),
      source: 'page',
    })
    stats.resolve({ count: 4, totalSize: 40, storageLimit: 100 })

    await expect(loading).resolves.toMatchObject({
      value: { count: 4, totalSize: 40, storageLimit: 100 },
      snapshotAt: 20,
      dirty: true,
      refreshState: 'idle',
    })
  })
})
