import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'
import type { ReceivedSnip } from './receive-object.ts'

export const DEFAULT_BODY_CACHE_MAX_BYTES = 50 * 1024 * 1024
export const DEFAULT_BODY_CACHE_MAX_INACTIVE = 20

interface BodyCacheBudgetOptions {
  maxBytes?: number
  maxInactive?: number
}

interface BodyEntry {
  query: Query
  queryKey: QueryKey
  queryHash: string
  size: number
  active: boolean
  lastUsed: number
}

function isBodyQueryKey(queryKey: readonly unknown[]) {
  return (
    queryKey.length === 5 &&
    queryKey[0] === 'session' &&
    typeof queryKey[1] === 'string' &&
    queryKey[2] === 'snip' &&
    typeof queryKey[3] === 'string' &&
    queryKey[4] === 'body'
  )
}

function bodySize(data: unknown) {
  const received = data as ReceivedSnip | undefined
  return received?.object?.body instanceof Blob
    ? received.object.body.size
    : null
}

export class BodyCacheBudget {
  readonly maxBytes: number
  readonly maxInactive: number

  private readonly lastUsed = new Map<string, number>()
  private readonly pinned = new Map<string, number>()
  private useSequence = 0
  private sweeping = false
  private sweepQueued = false
  private readonly unsubscribe: () => void
  private readonly queryClient: QueryClient

  constructor(
    queryClient: QueryClient,
    {
      maxBytes = DEFAULT_BODY_CACHE_MAX_BYTES,
      maxInactive = DEFAULT_BODY_CACHE_MAX_INACTIVE,
    }: BodyCacheBudgetOptions = {},
  ) {
    this.queryClient = queryClient
    this.maxBytes = maxBytes
    this.maxInactive = maxInactive
    this.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!isBodyQueryKey(event.query.queryKey)) return
      if (event.type === 'removed') {
        this.lastUsed.delete(event.query.queryHash)
        this.pinned.delete(event.query.queryHash)
        return
      }
      if (
        event.type === 'added' ||
        event.type === 'updated' ||
        event.type === 'observerAdded'
      ) {
        this.markUsed(event.query.queryHash)
      }
      if (
        event.type === 'updated' ||
        event.type === 'observerAdded' ||
        event.type === 'observerRemoved'
      ) {
        this.queueSweep()
      }
    })
  }

  touch(queryKey: QueryKey) {
    const query = this.queryClient.getQueryCache().find({
      queryKey,
      exact: true,
    })
    if (query && isBodyQueryKey(query.queryKey)) {
      this.markUsed(query.queryHash)
    }
  }

  retain(queryKey: QueryKey) {
    const query = this.queryClient.getQueryCache().find({
      queryKey,
      exact: true,
    })
    if (!query) return () => undefined
    this.markUsed(query.queryHash)
    this.pinned.set(
      query.queryHash,
      (this.pinned.get(query.queryHash) ?? 0) + 1,
    )
    return () => {
      const count = this.pinned.get(query.queryHash) ?? 0
      if (count <= 1) this.pinned.delete(query.queryHash)
      else this.pinned.set(query.queryHash, count - 1)
      this.queueSweep()
    }
  }

  sweep() {
    if (this.sweeping) return
    this.sweeping = true
    try {
      const entries = this.entries()
      let totalBytes = entries.reduce((total, entry) => total + entry.size, 0)
      let inactiveCount = entries.filter((entry) => !entry.active).length
      const inactive = entries
        .filter((entry) => !entry.active)
        .sort((left, right) => left.lastUsed - right.lastUsed)

      for (const entry of inactive) {
        if (totalBytes <= this.maxBytes && inactiveCount <= this.maxInactive) {
          break
        }
        this.queryClient.removeQueries({
          queryKey: entry.queryKey,
          exact: true,
        })
        totalBytes -= entry.size
        inactiveCount -= 1
      }
    } finally {
      this.sweeping = false
    }
  }

  getUsage() {
    const entries = this.entries()
    return {
      bytes: entries.reduce((total, entry) => total + entry.size, 0),
      inactive: entries.filter((entry) => !entry.active).length,
      objects: entries.length,
    }
  }

  dispose() {
    this.unsubscribe()
    this.lastUsed.clear()
    this.pinned.clear()
  }

  private entries(): BodyEntry[] {
    return this.queryClient
      .getQueryCache()
      .getAll()
      .flatMap((query) => {
        if (!isBodyQueryKey(query.queryKey)) return []
        const size = bodySize(query.state.data)
        if (size === null) return []
        return [
          {
            query,
            queryKey: query.queryKey,
            queryHash: query.queryHash,
            size,
            active:
              query.getObserversCount() > 0 ||
              (this.pinned.get(query.queryHash) ?? 0) > 0,
            lastUsed: this.lastUsed.get(query.queryHash) ?? 0,
          },
        ]
      })
  }

  private markUsed(queryHash: string) {
    this.lastUsed.set(queryHash, ++this.useSequence)
  }

  private queueSweep() {
    if (this.sweepQueued) return
    this.sweepQueued = true
    queueMicrotask(() => {
      this.sweepQueued = false
      this.sweep()
    })
  }
}

const budgets = new WeakMap<QueryClient, BodyCacheBudget>()

export function attachBodyCacheBudget(
  queryClient: QueryClient,
  options?: BodyCacheBudgetOptions,
) {
  const existing = budgets.get(queryClient)
  if (existing) return existing
  const budget = new BodyCacheBudget(queryClient, options)
  budgets.set(queryClient, budget)
  return budget
}

export function getBodyCacheBudget(queryClient: QueryClient) {
  return budgets.get(queryClient) ?? attachBodyCacheBudget(queryClient)
}
