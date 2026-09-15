import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  AttachmentMetadataUpdate,
  AttachmentDraftContent,
  AttachmentTextEncoding,
  CreateSnipResponse,
  DraftContent,
  RawCandidate,
  SendOptions,
  TextToAttachmentParameters,
} from '../../domain/index.ts'
import {
  applyAttachmentMetadataUpdate,
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

export interface SendOperationRecord {
  operation: SendOperation
  resolution: SendResolution | null
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

interface FailedState {
  phase: 'failed'
  draft: SendDraft
  failure: SendFailure
  operation: SendOperation
}

interface ConflictState {
  phase: 'conflict'
  draft: SendDraft
  failure: SendFailure
  operation: SendOperation
}

export type MutableSendState = EditingState | ReadyState | FailedState

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

type SendPhaseState =
  | MutableSendState
  | ConflictState
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

export type SendState = SendPhaseState & {
  operationRecords: Readonly<Record<string, SendOperationRecord>>
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
  dismissConflict(): void
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
  updateAttachmentMetadata(update: AttachmentMetadataUpdate): boolean
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
): state is SendState & MutableSendState {
  return ['editing', 'ready', 'failed'].includes(state.phase)
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
  const initialState = (): EditingState &
    Pick<SendState, 'operationRecords'> => ({
    phase: 'editing',
    draft: makeDraft(createId),
    operationRecords: {},
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
        if (state.phase === 'conflict') {
          if (options.key === undefined) return state
          const revision = state.draft.revision + 1
          return {
            phase: 'ready',
            draft: {
              ...state.draft,
              options: {
                ...state.draft.options,
                key: options.key,
                overwrite: false,
              },
              revision,
            },
          }
        }
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

    updateAttachmentMetadata(update) {
      const state = get()
      if (
        (state.phase !== 'ready' && state.phase !== 'failed') ||
        state.draft.content.kind !== 'attachment'
      ) {
        return false
      }
      const content = applyAttachmentMetadataUpdate(state.draft.content, update)
      const revision = state.draft.revision + 1
      set({
        phase: 'ready',
        draft: {
          ...state.draft,
          content: { ...content, previewVersion: revision },
          revision,
        },
      })
      return true
    },

    dismissConflict() {
      set((state) =>
        state.phase === 'conflict'
          ? {
              phase: 'ready',
              draft: {
                ...state.draft,
                options: { ...state.draft.options, overwrite: false },
                revision: state.draft.revision + 1,
              },
            }
          : state,
      )
    },

    enableOverwrite() {
      set((state) => {
        if (state.phase !== 'conflict') return state
        return {
          phase: 'ready',
          draft: {
            ...state.draft,
            options: { ...state.draft.options, overwrite: true },
            revision: state.draft.revision + 1,
          },
        }
      })
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
      set({
        phase: 'sending',
        draft: state.draft,
        operation,
        operationRecords: {
          ...state.operationRecords,
          [operation.operationId]: { operation, resolution: null },
        },
      })
      return operation
    },

    resolveSend(identity, currentSessionId, resolution) {
      const state = get()
      const record = state.operationRecords[identity.operationId]
      if (
        currentSessionId !== identity.sessionId ||
        !record ||
        !matchesIdentity(record.operation, identity)
      ) {
        return false
      }

      const operationRecords = {
        ...state.operationRecords,
        [identity.operationId]: { ...record, resolution },
      }
      if (!matchesOperation(state, identity)) {
        set({ operationRecords })
        return true
      }

      if (resolution.type === 'success') {
        set({
          phase: 'sent',
          draft: state.draft,
          operation: state.operation,
          operationRecords,
          result: resolution.result,
        })
        return true
      }

      if (resolution.failure.kind === 'uncertain') {
        set({
          phase: 'uncertain',
          draft: state.draft,
          operation: state.operation,
          operationRecords,
          failure: resolution.failure,
        })
      } else if (resolution.failure.kind === 'rejected') {
        set({
          phase: 'failed',
          draft: state.draft,
          operation: state.operation,
          operationRecords,
          failure: resolution.failure,
        })
      } else {
        set({
          phase: 'conflict',
          draft: state.draft,
          operation: state.operation,
          operationRecords,
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
      set({ ...initialState(), operationRecords: get().operationRecords })
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
