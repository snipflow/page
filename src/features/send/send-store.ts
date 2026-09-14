import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  AttachmentDraftContent,
  AttachmentTextEncoding,
  CreateSnipResponse,
  DraftContent,
  RawCandidate,
  SendOptions,
  TextToAttachmentParameters,
} from '../../domain/index.ts'
import {
  DEFAULT_SEND_OPTIONS,
  getFileTypeDefinition,
} from '../../domain/index.ts'

export interface SendDraft {
  content: DraftContent
  dismissedRawRevision: number | null
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

interface EditingState {
  phase: 'editing'
  draft: SendDraft
}

interface ReadyState {
  phase: 'ready'
  draft: SendDraft
}

interface FailureState {
  phase: 'conflict' | 'failed'
  draft: SendDraft
  failure: SendFailure
  operation: SendOperation
}

export type MutableSendState = EditingState | ReadyState | FailureState

interface TextConversionTask extends SendOperationIdentity {
  maxObjectBytes: number
  parameters: TextToAttachmentParameters
  text: string
}

export interface TextConversionState {
  autoSuggested: boolean
  direction: 'text-to-attachment'
  error: string | null
  identity: SendOperationIdentity
  parameters: TextToAttachmentParameters
  processing: boolean
  sourceText: string
}

interface AttachmentConversionState {
  direction: 'attachment-to-text'
  encoding: AttachmentTextEncoding
  identity: SendOperationIdentity
  source: AttachmentDraftContent
}

export type SendState =
  | MutableSendState
  | {
      phase: 'preparing'
      draft: SendDraft
      operation: SendOperationIdentity
      resume: MutableSendState
    }
  | {
      phase: 'converting'
      conversion: TextConversionState | AttachmentConversionState
      draft: SendDraft
      resume: MutableSendState
    }
  | { phase: 'sending'; draft: SendDraft; operation: SendOperation }
  | {
      phase: 'sent'
      draft: SendDraft
      operation: SendOperation
      result: CreateSnipResponse
    }
  | {
      phase: 'uncertain'
      draft: SendDraft
      operation: SendOperation
      failure: SendFailure
    }

export type SendResolution =
  | { type: 'success'; result: CreateSnipResponse }
  | { type: 'failure'; failure: SendFailure }

export interface SendActions {
  acknowledgeUncertain(): void
  beginAttachmentToText(sessionId: string): boolean
  beginPreparation(sessionId: string): SendOperationIdentity | null
  beginSend(sessionId: string): SendOperation | null
  beginTextConversion(maxObjectBytes: number): TextConversionTask | null
  cancelConversion(): boolean
  cancelPreparation(identity: SendOperationIdentity): boolean
  completeAttachmentToText(
    identity: SendOperationIdentity,
    text: string,
  ): boolean
  completeTextConversion(
    identity: SendOperationIdentity,
    content: AttachmentDraftContent,
  ): boolean
  confirmText(): boolean
  dismissRawRecommendation(
    identity: Pick<SendDraft, 'draftId' | 'revision'>,
  ): boolean
  editText(text: string): void
  enableOverwrite(): void
  failAttachmentToText(identity: SendOperationIdentity): boolean
  failTextConversion(identity: SendOperationIdentity, message: string): boolean
  hasUnsentDraft(): boolean
  reopenEditing(): void
  resetForSession(): void
  resolvePreparation(
    identity: SendOperationIdentity,
    content: AttachmentDraftContent,
  ): boolean
  resolveSend(
    identity: SendOperationIdentity,
    currentSessionId: string | null,
    resolution: SendResolution,
  ): boolean
  startNewDraft(): void
  startTextConversion(sessionId: string, candidate?: RawCandidate): boolean
  updateOptions(options: Partial<SendOptions>): void
  updateTextConversion(options: Partial<TextToAttachmentParameters>): boolean
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
    dismissedRawRevision: null,
    draftId: createId(),
    options: { ...DEFAULT_SEND_OPTIONS },
    revision: 0,
  }
}

export function hasSendDraftContent(draft: SendDraft) {
  return draft.content.kind === 'attachment' || draft.content.text.length > 0
}

export function isMutableSendState(
  state: SendState,
): state is MutableSendState {
  return ['editing', 'ready', 'failed', 'conflict'].includes(state.phase)
}

function localIdentity(
  draft: SendDraft,
  sessionId: string,
  createId: () => string,
): SendOperationIdentity {
  return {
    draftId: draft.draftId,
    operationId: createId(),
    revision: draft.revision,
    sessionId,
  }
}

function matchesIdentity(
  actual: SendOperationIdentity,
  expected: SendOperationIdentity,
) {
  return (
    actual.sessionId === expected.sessionId &&
    actual.draftId === expected.draftId &&
    actual.revision === expected.revision &&
    actual.operationId === expected.operationId
  )
}

function matchesOperation(
  state: SendState,
  identity: SendOperationIdentity,
): state is Extract<SendState, { phase: 'sending' }> {
  return state.phase === 'sending' && matchesIdentity(state.operation, identity)
}

function attachmentTextEncoding(
  content: AttachmentDraftContent,
): AttachmentTextEncoding {
  return ['markdown', 'plain-text'].includes(content.inspection.previewKind)
    ? 'utf8'
    : 'base64'
}

function defaultConversionParameters(
  candidate?: RawCandidate,
): TextToAttachmentParameters {
  const fileTypeId = candidate?.fileTypeId ?? 'txt'
  const definition = getFileTypeDefinition(fileTypeId)
  return {
    customMimeType: '',
    fileTypeId,
    filename:
      candidate?.filename ?? `snippet.${definition.extensions[0] ?? 'txt'}`,
    interpretation: candidate?.interpretation ?? 'utf8',
  }
}

export function createSendStore({
  createId = defaultId,
}: CreateSendStoreOptions = {}): StoreApi<SendStore> {
  const initialState = (): EditingState => ({
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

    dismissRawRecommendation(identity) {
      const state = get()
      if (
        state.phase !== 'editing' ||
        state.draft.content.kind !== 'text' ||
        state.draft.draftId !== identity.draftId ||
        state.draft.revision !== identity.revision
      ) {
        return false
      }
      set({
        ...state,
        draft: {
          ...state.draft,
          dismissedRawRevision: state.draft.revision,
        },
      })
      return true
    },

    reopenEditing() {
      set((state) => {
        if (
          !isMutableSendState(state) ||
          state.phase === 'editing' ||
          state.draft.content.kind !== 'text'
        ) {
          return state
        }
        const revision = state.draft.revision + 1
        return {
          phase: 'editing',
          draft: {
            ...state.draft,
            dismissedRawRevision:
              state.draft.dismissedRawRevision === state.draft.revision
                ? revision
                : state.draft.dismissedRawRevision,
            revision,
          },
        }
      })
    },

    beginPreparation(sessionId) {
      const state = get()
      if (!isMutableSendState(state)) return null
      const operation = localIdentity(state.draft, sessionId, createId)
      set({
        phase: 'preparing',
        draft: state.draft,
        operation,
        resume: state,
      })
      return operation
    },

    resolvePreparation(identity, content) {
      const state = get()
      if (
        state.phase !== 'preparing' ||
        !matchesIdentity(state.operation, identity)
      ) {
        return false
      }
      const revision = state.draft.revision + 1
      set({
        phase: 'ready',
        draft: {
          ...state.draft,
          content: { ...content, previewVersion: revision },
          dismissedRawRevision: null,
          revision,
        },
      })
      return true
    },

    cancelPreparation(identity) {
      const state = get()
      if (
        state.phase !== 'preparing' ||
        !matchesIdentity(state.operation, identity)
      ) {
        return false
      }
      set(state.resume)
      return true
    },

    startTextConversion(sessionId, candidate) {
      const state = get()
      if (
        !isMutableSendState(state) ||
        state.draft.content.kind !== 'text' ||
        state.draft.content.text.length === 0
      ) {
        return false
      }
      if (
        candidate &&
        state.draft.dismissedRawRevision === state.draft.revision
      ) {
        return false
      }
      set({
        phase: 'converting',
        conversion: {
          autoSuggested: candidate !== undefined,
          direction: 'text-to-attachment',
          error: null,
          identity: localIdentity(state.draft, sessionId, createId),
          parameters: defaultConversionParameters(candidate),
          processing: false,
          sourceText: state.draft.content.text,
        },
        draft: state.draft,
        resume: state,
      })
      return true
    },

    updateTextConversion(options) {
      const state = get()
      if (
        state.phase !== 'converting' ||
        state.conversion.direction !== 'text-to-attachment' ||
        state.conversion.processing
      ) {
        return false
      }
      set({
        ...state,
        conversion: {
          ...state.conversion,
          error: null,
          parameters: { ...state.conversion.parameters, ...options },
        },
      })
      return true
    },

    beginTextConversion(maxObjectBytes) {
      const state = get()
      if (
        state.phase !== 'converting' ||
        state.conversion.direction !== 'text-to-attachment' ||
        state.conversion.processing
      ) {
        return null
      }
      const task: TextConversionTask = {
        ...state.conversion.identity,
        maxObjectBytes,
        parameters: { ...state.conversion.parameters },
        text: state.conversion.sourceText,
      }
      set({
        ...state,
        conversion: {
          ...state.conversion,
          error: null,
          processing: true,
        },
      })
      return task
    },

    completeTextConversion(identity, content) {
      const state = get()
      if (
        state.phase !== 'converting' ||
        state.conversion.direction !== 'text-to-attachment' ||
        !state.conversion.processing ||
        !matchesIdentity(state.conversion.identity, identity)
      ) {
        return false
      }
      const revision = state.draft.revision + 1
      set({
        phase: 'ready',
        draft: {
          ...state.draft,
          content: {
            ...content,
            previewVersion: revision,
            sourceText: state.conversion.sourceText,
          },
          dismissedRawRevision: null,
          revision,
        },
      })
      return true
    },

    failTextConversion(identity, message) {
      const state = get()
      if (
        state.phase !== 'converting' ||
        state.conversion.direction !== 'text-to-attachment' ||
        !matchesIdentity(state.conversion.identity, identity)
      ) {
        return false
      }
      set({
        ...state,
        conversion: {
          ...state.conversion,
          error: message,
          processing: false,
        },
      })
      return true
    },

    beginAttachmentToText(sessionId) {
      const state = get()
      if (
        !isMutableSendState(state) ||
        state.draft.content.kind !== 'attachment'
      ) {
        return false
      }
      const identity = localIdentity(state.draft, sessionId, createId)
      const encoding = attachmentTextEncoding(state.draft.content)
      set({
        phase: 'converting',
        conversion: {
          direction: 'attachment-to-text',
          encoding,
          identity,
          source: state.draft.content,
        },
        draft: state.draft,
        resume: state,
      })
      return true
    },

    completeAttachmentToText(identity, text) {
      const state = get()
      if (
        state.phase !== 'converting' ||
        state.conversion.direction !== 'attachment-to-text' ||
        !matchesIdentity(state.conversion.identity, identity)
      ) {
        return false
      }
      set({
        phase: 'editing',
        draft: {
          ...state.draft,
          content: { kind: 'text', text },
          dismissedRawRevision: null,
          revision: state.draft.revision + 1,
        },
      })
      return true
    },

    failAttachmentToText(identity) {
      const state = get()
      if (
        state.phase !== 'converting' ||
        state.conversion.direction !== 'attachment-to-text' ||
        !matchesIdentity(state.conversion.identity, identity)
      ) {
        return false
      }
      set(state.resume)
      return true
    },

    cancelConversion() {
      const state = get()
      if (state.phase !== 'converting') return false
      const dismissedRevision =
        state.conversion.direction === 'text-to-attachment' &&
        state.conversion.autoSuggested
          ? state.draft.revision
          : state.draft.dismissedRawRevision
      set({
        ...state.resume,
        draft: {
          ...state.resume.draft,
          dismissedRawRevision: dismissedRevision,
        },
      })
      return true
    },

    updateOptions(options) {
      set((state) => {
        if (!isMutableSendState(state) || state.phase === 'editing')
          return state
        const revision = state.draft.revision + 1
        return {
          phase: 'ready',
          draft: {
            ...state.draft,
            dismissedRawRevision:
              state.draft.dismissedRawRevision === state.draft.revision
                ? revision
                : state.draft.dismissedRawRevision,
            options: { ...state.draft.options, ...options },
            revision,
          },
        }
      })
    },

    enableOverwrite() {
      get().updateOptions({ overwrite: true })
    },

    beginSend(sessionId) {
      const state = get()
      if (state.phase !== 'ready' && state.phase !== 'failed') return null

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

      if (resolution.failure.kind === 'uncertain') {
        set({
          phase: 'uncertain',
          draft: state.draft,
          operation: state.operation,
          failure: resolution.failure,
        })
      } else {
        set({
          phase: resolution.failure.kind === 'rejected' ? 'failed' : 'conflict',
          draft: state.draft,
          operation: state.operation,
          failure: resolution.failure,
        })
      }
      return true
    },

    acknowledgeUncertain() {
      set((state) => {
        if (state.phase !== 'uncertain') return state
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
      return state.phase !== 'sent' && hasSendDraftContent(state.draft)
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
