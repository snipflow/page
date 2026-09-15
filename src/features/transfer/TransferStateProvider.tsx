import { useEffect, useState, type ReactNode } from 'react'
import type { AuthSession } from '../auth/index.ts'
import {
  ReceiveStoreProvider,
  createReceiveStore,
} from '../receive/receive-store.ts'
import { SendStoreProvider, createSendStore } from '../send/send-store.ts'
import {
  DashboardStoreProvider,
  createDashboardStore,
} from '../dashboard/dashboard-store.ts'
import { ObjectUrlProvider } from './ObjectUrlProvider.tsx'
import { ObjectUrlRegistry } from './object-url-registry.ts'

interface TransferStateProviderProps {
  children: ReactNode
  session: AuthSession
}

export function TransferStateProvider({
  children,
  session,
}: TransferStateProviderProps) {
  const [sendStore] = useState(createSendStore)
  const [receiveStore] = useState(createReceiveStore)
  const [dashboardStore] = useState(createDashboardStore)
  const [objectUrls] = useState(() => new ObjectUrlRegistry())

  useEffect(
    () =>
      session.registerCleanup(() => {
        sendStore.getState().resetForSession()
        receiveStore.getState().resetForSession()
        dashboardStore.getState().resetForSession()
        objectUrls.revokeAll()
      }),
    [dashboardStore, objectUrls, receiveStore, sendStore, session],
  )

  useEffect(() => () => objectUrls.revokeAll(), [objectUrls])

  return (
    <SendStoreProvider store={sendStore}>
      <ReceiveStoreProvider store={receiveStore}>
        <DashboardStoreProvider store={dashboardStore}>
          <ObjectUrlProvider registry={objectUrls}>
            {children}
          </ObjectUrlProvider>
        </DashboardStoreProvider>
      </ReceiveStoreProvider>
    </SendStoreProvider>
  )
}
