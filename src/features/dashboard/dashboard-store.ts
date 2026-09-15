import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export interface DashboardStore {
  detailKey: string | null
  detailSourceIndex: number
  detailScrollY: number
  searchQuery: string
  closeDetail(): void
  openDetail(key: string, sourceIndex: number, scrollY: number): void
  resetForSession(): void
  setSearchQuery(query: string): void
}

const initialState = {
  detailKey: null,
  detailSourceIndex: 0,
  detailScrollY: 0,
  searchQuery: '',
}

export function createDashboardStore(): StoreApi<DashboardStore> {
  return createStore<DashboardStore>()((set) => ({
    ...initialState,
    closeDetail() {
      set({ detailKey: null })
    },
    openDetail(detailKey, detailSourceIndex, detailScrollY) {
      set({ detailKey, detailSourceIndex, detailScrollY })
    },
    resetForSession() {
      set(initialState)
    },
    setSearchQuery(searchQuery) {
      set({ searchQuery })
    },
  }))
}

const DashboardStoreContext = createContext<StoreApi<DashboardStore> | null>(
  null,
)

export function DashboardStoreProvider({
  children,
  store,
}: {
  children: ReactNode
  store: StoreApi<DashboardStore>
}) {
  return createElement(
    DashboardStoreContext.Provider,
    { value: store },
    children,
  )
}

export function useDashboardStore<T>(selector: (state: DashboardStore) => T) {
  const store = useDashboardStoreApi()
  return useStore(store, selector)
}

export function useDashboardStoreApi() {
  const store = useContext(DashboardStoreContext)
  if (!store) throw new Error('DashboardStoreProvider is missing')
  return store
}
