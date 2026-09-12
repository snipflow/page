import { useEffect, useState, type ReactNode } from 'react'
import type { AuthSession } from '../auth/index.ts'
import {
  ReceiveStoreProvider,
  createReceiveStore,
} from '../receive/receive-store.ts'
import { SendStoreProvider, createSendStore } from '../send/send-store.ts'
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
  const [objectUrls] = useState(() => new ObjectUrlRegistry())

  useEffect(
    () =>
      session.registerCleanup(() => {
        sendStore.getState().resetForSession()
        receiveStore.getState().resetForSession()
        objectUrls.revokeAll()
      }),
    [objectUrls, receiveStore, sendStore, session],
  )

  useEffect(() => () => objectUrls.revokeAll(), [objectUrls])

  return (
    <SendStoreProvider store={sendStore}>
      <ReceiveStoreProvider store={receiveStore}>
        <ObjectUrlProvider registry={objectUrls}>{children}</ObjectUrlProvider>
      </ReceiveStoreProvider>
    </SendStoreProvider>
  )
}
