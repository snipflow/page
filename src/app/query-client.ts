import { QueryClient } from '@tanstack/react-query'
import { attachBodyCacheBudget } from '../queries/body-cache-budget.ts'

export function createAppQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  })
  attachBodyCacheBudget(queryClient)
  return queryClient
}

export const appQueryClient = createAppQueryClient()
