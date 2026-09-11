import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'
import { appQueryClient } from './query-client.ts'
import { appRouter } from './router.tsx'

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={appQueryClient}>
        <RouterProvider router={appRouter} />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
