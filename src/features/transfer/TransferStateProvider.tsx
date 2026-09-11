import { useEffect, useState, type ReactNode } from 'react'
import type { AuthSession } from '../auth/index.ts'
import {
  ReceiveStoreProvider,
  createReceiveStore,
} from '../receive/receive-store.ts'
import { SendStoreProvider, createSendStore } from '../send/send-store.ts'

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

  useEffect(
    () =>
      session.registerCleanup(() => {
        sendStore.getState().resetForSession()
        receiveStore.getState().resetForSession()
      }),
    [receiveStore, sendStore, session],
  )

  return (
    <SendStoreProvider store={sendStore}>
      <ReceiveStoreProvider store={receiveStore}>
        {children}
      </ReceiveStoreProvider>
    </SendStoreProvider>
  )
}
