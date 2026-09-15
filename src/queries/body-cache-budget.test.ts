import { QueryClient, QueryObserver } from '@tanstack/react-query'
import {
  BodyCacheBudget,
  DEFAULT_BODY_CACHE_MAX_BYTES,
  DEFAULT_BODY_CACHE_MAX_INACTIVE,
} from './body-cache-budget.ts'
import { snipBodyQueryKey } from './query-keys.ts'
import type { ReceivedSnip } from './receive-object.ts'

function body(size: number) {
  return {
    object: { body: new Blob([new Uint8Array(size)]) },
  } as ReceivedSnip
}

async function flushBudget() {
  await Promise.resolve()
}

describe('body cache budget', () => {
  it('uses the phase-eight byte and inactive-object defaults', () => {
    const budget = new BodyCacheBudget(new QueryClient())
    expect(budget.maxBytes).toBe(DEFAULT_BODY_CACHE_MAX_BYTES)
    expect(budget.maxBytes).toBe(50 * 1024 * 1024)
    expect(budget.maxInactive).toBe(DEFAULT_BODY_CACHE_MAX_INACTIVE)
    expect(budget.maxInactive).toBe(20)
    budget.dispose()
  })

  it('evicts the least recently used inactive object by entry count', async () => {
    const queryClient = new QueryClient()
    const budget = new BodyCacheBudget(queryClient, {
      maxBytes: 100,
      maxInactive: 2,
    })
    const first = snipBodyQueryKey('session', 'first')
    const second = snipBodyQueryKey('session', 'second')
    const third = snipBodyQueryKey('session', 'third')
    queryClient.setQueryData(first, body(1))
    queryClient.setQueryData(second, body(1))
    budget.touch(first)
    queryClient.setQueryData(third, body(1))
    await flushBudget()

    expect(queryClient.getQueryData(first)).toBeDefined()
    expect(queryClient.getQueryData(second)).toBeUndefined()
    expect(queryClient.getQueryData(third)).toBeDefined()
    expect(budget.getUsage()).toEqual({ bytes: 2, inactive: 2, objects: 2 })
    budget.dispose()
  })

  it('uses Blob bytes for the cumulative limit', async () => {
    const queryClient = new QueryClient()
    const budget = new BodyCacheBudget(queryClient, {
      maxBytes: 5,
      maxInactive: 20,
    })
    queryClient.setQueryData(snipBodyQueryKey('session', 'first'), body(3))
    queryClient.setQueryData(snipBodyQueryKey('session', 'second'), body(3))
    await flushBudget()

    expect(budget.getUsage()).toEqual({ bytes: 3, inactive: 1, objects: 1 })
    budget.dispose()
  })

  it('never evicts an observed body even when active bytes exceed the budget', async () => {
    const queryClient = new QueryClient()
    const budget = new BodyCacheBudget(queryClient, {
      maxBytes: 5,
      maxInactive: 20,
    })
    const activeKey = snipBodyQueryKey('session', 'active')
    const inactiveKey = snipBodyQueryKey('session', 'inactive')
    const observer = new QueryObserver(queryClient, {
      queryKey: activeKey,
      enabled: false,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    queryClient.setQueryData(activeKey, body(10))
    queryClient.setQueryData(inactiveKey, body(1))
    await flushBudget()

    expect(queryClient.getQueryData(activeKey)).toBeDefined()
    expect(queryClient.getQueryData(inactiveKey)).toBeUndefined()
    expect(budget.getUsage()).toEqual({ bytes: 10, inactive: 0, objects: 1 })
    unsubscribe()
    await flushBudget()
    expect(queryClient.getQueryData(activeKey)).toBeUndefined()
    budget.dispose()
  })
})
