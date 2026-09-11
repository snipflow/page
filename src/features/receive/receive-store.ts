import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export interface ReceiveOperationIdentity {
  key: string
  operationId: string
  sessionId: string
}

export interface ReceiveFailure {
  kind: 'missing' | 'network' | 'read' | 'rejected'
  message: string
  requestId: string | null
}

export type ReceiveView =
  | { status: 'input' }
  | { status: 'loading'; operation: ReceiveOperationIdentity }
  | { status: 'result'; result: ReceiveOperationIdentity }
  | {
      status: 'error'
      operation: ReceiveOperationIdentity
      failure: ReceiveFailure
    }

export type DeleteState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'deleting'; operation: ReceiveOperationIdentity }
  | {
      status: 'failed' | 'uncertain'
      operation: ReceiveOperationIdentity
      message: string
    }

export interface ReceiveStore {
  deleteState: DeleteState
  inputKey: string
  view: ReceiveView
  beginDelete(sessionId: string): ReceiveOperationIdentity | null
  beginRead(sessionId: string, key: string): ReceiveOperationIdentity | null
  cancelDelete(): void
  requestDelete(): void
  resetForSession(): void
  resolveDelete(
    identity: ReceiveOperationIdentity,
    currentSessionId: string | null,
    resolution:
      | { type: 'success' }
      | { type: 'missing'; failure: ReceiveFailure }
      | { type: 'failure'; message: string; uncertain: boolean },
  ): boolean
  resolveRead(
    identity: ReceiveOperationIdentity,
    currentSessionId: string | null,
    resolution:
      { type: 'success' } | { type: 'failure'; failure: ReceiveFailure },
  ): boolean
  returnToInput(): void
  setInputKey(key: string): void
}

export interface CreateReceiveStoreOptions {
  createId?: () => string
}

function defaultId() {
  return globalThis.crypto.randomUUID()
}

function sameOperation(
  left: ReceiveOperationIdentity,
  right: ReceiveOperationIdentity,
) {
  return (
    left.sessionId === right.sessionId &&
    left.key === right.key &&
    left.operationId === right.operationId
  )
}

export function createReceiveStore({
  createId = defaultId,
}: CreateReceiveStoreOptions = {}): StoreApi<ReceiveStore> {
  const initialState = {
    deleteState: { status: 'idle' } as DeleteState,
    inputKey: '',
    view: { status: 'input' } as ReceiveView,
  }

  return createStore<ReceiveStore>()((set, get) => ({
    ...initialState,

    setInputKey(inputKey) {
      set((state) => ({
        inputKey,
        ...(state.view.status === 'error'
          ? { view: { status: 'input' } as ReceiveView }
          : {}),
      }))
    },

    beginRead(sessionId, key) {
      const state = get()
      if (
        state.view.status === 'loading' &&
        state.view.operation.sessionId === sessionId &&
        state.view.operation.key === key
      ) {
        return null
      }
      const operation = { key, operationId: createId(), sessionId }
      set({
        deleteState: { status: 'idle' },
        inputKey: key,
        view: { status: 'loading', operation },
      })
      return operation
    },

    resolveRead(identity, currentSessionId, resolution) {
      const state = get()
      if (
        currentSessionId !== identity.sessionId ||
        state.view.status !== 'loading' ||
        !sameOperation(state.view.operation, identity)
      ) {
        return false
      }
      set({
        deleteState: { status: 'idle' },
        view:
          resolution.type === 'success'
            ? { status: 'result', result: identity }
            : {
                status: 'error',
                operation: identity,
                failure: resolution.failure,
              },
      })
      return true
    },

    returnToInput() {
      set({ deleteState: { status: 'idle' }, view: { status: 'input' } })
    },

    requestDelete() {
      set((state) =>
        state.view.status === 'result'
          ? { deleteState: { status: 'confirming' } }
          : state,
      )
    },

    cancelDelete() {
      set((state) =>
        state.deleteState.status === 'confirming' ||
        state.deleteState.status === 'failed' ||
        state.deleteState.status === 'uncertain'
          ? { deleteState: { status: 'idle' } }
          : state,
      )
    },

    beginDelete(sessionId) {
      const state = get()
      if (
        state.view.status !== 'result' ||
        state.deleteState.status !== 'confirming' ||
        state.view.result.sessionId !== sessionId
      ) {
        return null
      }
      const operation = {
        key: state.view.result.key,
        operationId: createId(),
        sessionId,
      }
      set({ deleteState: { status: 'deleting', operation } })
      return operation
    },

    resolveDelete(identity, currentSessionId, resolution) {
      const state = get()
      if (
        currentSessionId !== identity.sessionId ||
        state.view.status !== 'result' ||
        state.view.result.sessionId !== identity.sessionId ||
        state.view.result.key !== identity.key ||
        state.deleteState.status !== 'deleting' ||
        !sameOperation(state.deleteState.operation, identity)
      ) {
        return false
      }

      if (resolution.type === 'success') {
        set({ deleteState: { status: 'idle' }, view: { status: 'input' } })
      } else if (resolution.type === 'missing') {
        set({
          deleteState: { status: 'idle' },
          view: {
            status: 'error',
            operation: identity,
            failure: resolution.failure,
          },
        })
      } else {
        set({
          deleteState: {
            status: resolution.uncertain ? 'uncertain' : 'failed',
            operation: identity,
            message: resolution.message,
          },
        })
      }
      return true
    },

    resetForSession() {
      set(initialState)
    },
  }))
}

const ReceiveStoreContext = createContext<StoreApi<ReceiveStore> | null>(null)

export function ReceiveStoreProvider({
  children,
  store,
}: {
  children: ReactNode
  store: StoreApi<ReceiveStore>
}) {
  return createElement(ReceiveStoreContext.Provider, { value: store }, children)
}

export function useReceiveStoreApi() {
  const store = useContext(ReceiveStoreContext)
  if (!store) {
    throw new Error('ReceiveStoreProvider is missing')
  }
  return store
}

export function useReceiveStore<T>(selector: (state: ReceiveStore) => T): T {
  return useStore(useReceiveStoreApi(), selector)
}
