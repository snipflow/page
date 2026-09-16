import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import { AuthGate } from '../features/auth/AuthGate.tsx'
import { AuthPage } from '../features/auth/AuthPage.tsx'
import type { AuthSession } from '../features/auth/auth-session.ts'
import {
  isFunctionalPath,
  isReceiveTarget,
} from '../features/auth/auth-session.ts'
import { TransferShell } from '../features/auth/TransferShell.tsx'
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx'
import { ReceivePage } from '../features/receive/ReceivePage.tsx'
import { ReceiveRoutePage } from '../features/receive/ReceiveRoutePage.tsx'
import { SendPage } from '../features/send/SendPage.tsx'
import { NotFoundPage, RouteErrorPage } from '../pages/StatusPages.tsx'
import { RootLayout } from './RootLayout.tsx'

interface RouterContext {
  authSession: AuthSession
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    throw redirect({
      to: context.authSession.isAuthenticated() ? '/send' : '/auth',
      replace: true,
    })
  },
})

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  beforeLoad: ({ context }) => {
    if (context.authSession.isAuthenticated()) {
      const target = context.authSession.consumeTarget()
      if (isReceiveTarget(target)) {
        throw redirect({
          to: '/receive/$key',
          params: { key: target.slice('/receive/'.length) },
          replace: true,
        })
      }
      throw redirect({
        to: target,
        replace: true,
      })
    }
  },
  component: AuthPage,
})

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  beforeLoad: ({ context, location }) => {
    if (!context.authSession.isAuthenticated()) {
      if (isFunctionalPath(location.pathname)) {
        context.authSession.rememberTarget(location.pathname)
      }
      throw redirect({ to: '/auth', replace: true })
    }
  },
  component: AuthGate,
})

const transferRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: '_transfer',
  component: TransferShell,
})

const sendRoute = createRoute({
  getParentRoute: () => transferRoute,
  path: '/send',
  component: SendPage,
})

const receiveRoute = createRoute({
  getParentRoute: () => transferRoute,
  path: '/receive',
  component: ReceivePage,
})

const receiveKeyRoute = createRoute({
  getParentRoute: () => transferRoute,
  path: '/receive/$key',
  component: ReceiveRoutePage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  authenticatedRoute.addChildren([
    transferRoute.addChildren([sendRoute, receiveRoute, receiveKeyRoute]),
    dashboardRoute,
  ]),
])

interface CreateAppRouterOptions {
  authSession: AuthSession
  history?: RouterHistory
  queryClient: QueryClient
}

export function createAppRouter({
  authSession,
  history,
  queryClient,
}: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    context: { authSession, queryClient },
    defaultErrorComponent: RouteErrorPage,
    defaultNotFoundComponent: NotFoundPage,
    defaultPreload: 'intent',
    ...(history ? { history } : {}),
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>
