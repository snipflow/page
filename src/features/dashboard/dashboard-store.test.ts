import { describe, expect, it } from 'vitest'
import { createDashboardStore } from './dashboard-store.ts'

describe('dashboard store', () => {
  it('retains search and detail anchoring until the session resets', () => {
    const store = createDashboardStore()

    store.getState().setSearchQuery('CaseSensitive')
    store.getState().openDetail('target', 3, 480)
    expect(store.getState()).toMatchObject({
      detailKey: 'target',
      detailSourceIndex: 3,
      detailScrollY: 480,
      searchQuery: 'CaseSensitive',
    })

    store.getState().closeDetail()
    expect(store.getState().detailKey).toBeNull()
    expect(store.getState().searchQuery).toBe('CaseSensitive')

    store.getState().resetForSession()
    expect(store.getState()).toMatchObject({
      detailKey: null,
      detailSourceIndex: 0,
      detailScrollY: 0,
      searchQuery: '',
    })
  })
})
