import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AuthRuntimeProvider } from '../features/auth/AuthRuntimeProvider.tsx'
import { SessionRouterSync } from '../features/auth/SessionRouterSync.tsx'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'
import { appQueryClient } from './query-client.ts'
import { appAuthRuntime, appRouter } from './runtime.ts'

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={appQueryClient}>
        <AuthRuntimeProvider runtime={appAuthRuntime}>
          <SessionRouterSync router={appRouter} />
          <RouterProvider router={appRouter} />
        </AuthRuntimeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
