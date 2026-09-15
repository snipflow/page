import { createAppQueryClient } from './query-client.ts'

describe('application query defaults', () => {
  it('does not create implicit retries or lifecycle refetches', () => {
    const queryClient = createAppQueryClient()

    expect(queryClient.getDefaultOptions()).toMatchObject({
      mutations: { retry: false },
      queries: {
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: false,
      },
    })
    queryClient.clear()
  })
})
