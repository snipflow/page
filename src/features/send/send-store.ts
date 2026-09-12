import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  CreateSnipResponse,
  DraftContent,
  AttachmentDraftContent,
  SendOptions,
} from '../../domain/index.ts'
import { DEFAULT_SEND_OPTIONS } from '../../domain/index.ts'

export interface SendDraft {
  content: DraftContent
  draftId: string
  options: SendOptions
  revision: number
}

export interface SendOperationIdentity {
  draftId: string
  operationId: string
  revision: number
  sessionId: string
}

export interface SendOperation extends SendOperationIdentity {
  content: DraftContent
  options: SendOptions
}

export interface SendFailure {
  kind: 'conflict' | 'rejected' | 'uncertain'
  message: string
  requestId: string | null
  status: number | null
}

export type SendState =
  | { phase: 'editing'; draft: SendDraft }
  | { phase: 'ready'; draft: SendDraft }
  | { phase: 'sending'; draft: SendDraft; operation: SendOperation }
  | {
      phase: 'sent'
      draft: SendDraft
      operation: SendOperation
      result: CreateSnipResponse
    }
  | {
      phase: 'failed' | 'conflict' | 'uncertain'
      draft: SendDraft
      operation: SendOperation
      failure: SendFailure
    }

export type SendResolution =
  | { type: 'success'; result: CreateSnipResponse }
  | { type: 'failure'; failure: SendFailure }

export interface SendActions {
  acknowledgeUncertain(): void
  beginSend(sessionId: string): SendOperation | null
  confirmText(): boolean
  editText(text: string): void
  enableOverwrite(): void
  hasUnsentDraft(): boolean
  removeAttachment(): boolean
  replaceWithAttachment(
    identity: Pick<SendDraft, 'draftId' | 'revision'>,
    content: AttachmentDraftContent,
  ): boolean
  reopenEditing(): void
  resetForSession(): void
  resolveSend(
    identity: SendOperationIdentity,
    currentSessionId: string | null,
    resolution: SendResolution,
  ): boolean
  startNewDraft(): void
  updateOptions(options: Partial<SendOptions>): void
}

export type SendStore = SendState & SendActions

export interface CreateSendStoreOptions {
  createId?: () => string
}

function defaultId() {
  return globalThis.crypto.randomUUID()
}

function copyContent(content: DraftContent): DraftContent {
  if (content.kind === 'text') {
    return { kind: 'text', text: content.text }
  }
  return { ...content }
}

function makeDraft(createId: () => string): SendDraft {
  return {
    content: { kind: 'text', text: '' },
    draftId: createId(),
    options: { ...DEFAULT_SEND_OPTIONS },
    revision: 0,
  }
}

function matchesOperation(
  state: SendState,
  identity: SendOperationIdentity,
): state is Extract<SendState, { phase: 'sending' }> {
  return (
    state.phase === 'sending' &&
    state.operation.sessionId === identity.sessionId &&
    state.operation.draftId === identity.draftId &&
    state.operation.revision === identity.revision &&
    state.operation.operationId === identity.operationId
  )
}

export function createSendStore({
  createId = defaultId,
}: CreateSendStoreOptions = {}): StoreApi<SendStore> {
  const initialState = (): SendState => ({
    phase: 'editing',
    draft: makeDraft(createId),
  })

  return createStore<SendStore>()((set, get) => ({
    ...initialState(),

    editText(text) {
      set((state) => {
        if (state.phase !== 'editing' || state.draft.content.kind !== 'text') {
          return state
        }
        return {
          ...state,
          draft: {
            ...state.draft,
            content: { kind: 'text', text },
            revision: state.draft.revision + 1,
          },
        }
      })
    },

    confirmText() {
      const state = get()
      if (
        state.phase !== 'editing' ||
        state.draft.content.kind !== 'text' ||
        state.draft.content.text.length === 0
      ) {
        return false
      }
      set({ ...state, phase: 'ready' })
      return true
    },

    reopenEditing() {
      set((state) => {
        if (
          !['ready', 'failed', 'conflict'].includes(state.phase) ||
          state.draft.content.kind !== 'text'
        ) {
          return state
        }
        return {
          phase: 'editing',
          draft: {
            ...state.draft,
            revision: state.draft.revision + 1,
          },
        }
      })
    },

    replaceWithAttachment(identity, content) {
      const state = get()
      if (
        !['editing', 'ready', 'failed', 'conflict'].includes(state.phase) ||
        state.draft.draftId !== identity.draftId ||
        state.draft.revision !== identity.revision
      ) {
        return false
      }
      set({
        phase: 'ready',
        draft: {
          ...state.draft,
          content,
          revision: state.draft.revision + 1,
        },
      })
      return true
    },

    removeAttachment() {
      const state = get()
      if (
        !['ready', 'failed', 'conflict'].includes(state.phase) ||
        state.draft.content.kind !== 'attachment'
      ) {
        return false
      }
      set({
        phase: 'editing',
        draft: {
          ...state.draft,
          content: { kind: 'text', text: '' },
          revision: state.draft.revision + 1,
        },
      })
      return true
    },

    updateOptions(options) {
      set((state) => {
        if (!['ready', 'failed', 'conflict'].includes(state.phase)) {
          return state
        }
        return {
          phase: 'ready',
          draft: {
            ...state.draft,
            options: { ...state.draft.options, ...options },
            revision: state.draft.revision + 1,
          },
        }
      })
    },

    enableOverwrite() {
      get().updateOptions({ overwrite: true })
    },

    beginSend(sessionId) {
      const state = get()
      if (!['ready', 'failed'].includes(state.phase)) {
        return null
      }

      const operation: SendOperation = {
        sessionId,
        draftId: state.draft.draftId,
        revision: state.draft.revision,
        operationId: createId(),
        content: copyContent(state.draft.content),
        options: { ...state.draft.options },
      }
      set({ phase: 'sending', draft: state.draft, operation })
      return operation
    },

    resolveSend(identity, currentSessionId, resolution) {
      const state = get()
      if (
        currentSessionId !== identity.sessionId ||
        !matchesOperation(state, identity)
      ) {
        return false
      }

      if (resolution.type === 'success') {
        set({
          phase: 'sent',
          draft: state.draft,
          operation: state.operation,
          result: resolution.result,
        })
        return true
      }

      const phase =
        resolution.failure.kind === 'rejected'
          ? 'failed'
          : resolution.failure.kind
      set({
        phase,
        draft: state.draft,
        operation: state.operation,
        failure: resolution.failure,
      })
      return true
    },

    acknowledgeUncertain() {
      set((state) => {
        if (state.phase !== 'uncertain') {
          return state
        }
        return {
          phase: 'ready',
          draft: {
            ...state.draft,
            revision: state.draft.revision + 1,
          },
        }
      })
    },

    startNewDraft() {
      set(initialState())
    },

    resetForSession() {
      set(initialState())
    },

    hasUnsentDraft() {
      const state = get()
      return (
        state.phase !== 'sent' &&
        (state.draft.content.kind === 'attachment' ||
          state.draft.content.text.length > 0)
      )
    },
  }))
}

const SendStoreContext = createContext<StoreApi<SendStore> | null>(null)

export function SendStoreProvider({
  children,
  store,
}: {
  children: ReactNode
  store: StoreApi<SendStore>
}) {
  return createElement(SendStoreContext.Provider, { value: store }, children)
}

export function useSendStoreApi() {
  const store = useContext(SendStoreContext)
  if (!store) {
    throw new Error('SendStoreProvider is missing')
  }
  return store
}

export function useSendStore<T>(selector: (state: SendStore) => T): T {
  return useStore(useSendStoreApi(), selector)
}
