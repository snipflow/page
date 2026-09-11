import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import {
  AuthPage,
  DashboardPage,
  NotFoundPage,
  ReceivePage,
  RouteErrorPage,
  SendPage,
} from '../pages/StatusPages.tsx'
import { RootLayout } from './RootLayout.tsx'
import { appQueryClient } from './query-client.ts'

interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/auth', replace: true })
  },
})

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  component: AuthPage,
})

const sendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/send',
  component: SendPage,
})

const receiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/receive',
  component: ReceivePage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  sendRoute,
  receiveRoute,
  dashboardRoute,
])

interface CreateAppRouterOptions {
  history?: RouterHistory
  queryClient: QueryClient
}

export function createAppRouter({
  history,
  queryClient,
}: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultErrorComponent: RouteErrorPage,
    defaultNotFoundComponent: NotFoundPage,
    defaultPreload: 'intent',
    ...(history ? { history } : {}),
  })
}

export const appRouter = createAppRouter({ queryClient: appQueryClient })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof appRouter
  }
}
