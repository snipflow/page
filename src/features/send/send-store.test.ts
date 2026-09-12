import type { CreateSnipResponse } from '../../domain/index.ts'
import { DEFAULT_SEND_OPTIONS, deriveContentType } from '../../domain/index.ts'
import { createSendStore } from './send-store.ts'

const createdResult: CreateSnipResponse = {
  key: 'server-key',
  contentType: 'text/plain; charset=utf-8',
  size: 7,
  source: 'page',
  createdAt: '2026-09-11T00:00:00.000Z',
  expiresAt: '2026-09-12T00:00:00.000Z',
}

function makeStore() {
  let sequence = 0
  return createSendStore({ createId: () => `send-id-${++sequence}` })
}

function attachment(body = new Blob(['file'])) {
  return {
    kind: 'attachment' as const,
    body,
    contentType: 'text/markdown',
    filename: 'notes.md',
    inspection: {
      ...deriveContentType({
        contentType: 'text/markdown',
        filename: 'notes.md',
        disposition: 'attachment',
        utf8Decodable: true,
      }),
      imageDimensions: null,
      previewIssue: null,
    },
  }
}

describe('send store', () => {
  it('increments the revision while preserving exact text', () => {
    const store = makeStore()

    store.getState().editText('  第一行\nsecond line  ')
    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: {
        content: { kind: 'text', text: '  第一行\nsecond line  ' },
        revision: 1,
      },
    })
    expect(store.getState().confirmText()).toBe(true)
    expect(store.getState().phase).toBe('ready')
  })

  it('does not prepare or send an empty text draft', () => {
    const store = makeStore()

    expect(store.getState().confirmText()).toBe(false)
    expect(store.getState().beginSend('session-one')).toBeNull()
  })

  it('replaces only the exact draft revision with a validated attachment', () => {
    const store = makeStore()
    const initial = store.getState().draft
    store.getState().editText('changed while inspection was running')

    expect(
      store
        .getState()
        .replaceWithAttachment(
          { draftId: initial.draftId, revision: initial.revision },
          attachment(),
        ),
    ).toBe(false)
    expect(store.getState().draft.content).toEqual({
      kind: 'text',
      text: 'changed while inspection was running',
    })

    const current = store.getState().draft
    const body = new Blob(['exact bytes'])
    expect(
      store
        .getState()
        .replaceWithAttachment(
          { draftId: current.draftId, revision: current.revision },
          attachment(body),
        ),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      draft: { content: { filename: 'notes.md', kind: 'attachment' } },
    })
    expect(store.getState().draft.content).toMatchObject({ body })
  })

  it('removes an attachment without losing its key and TTL options', () => {
    const store = makeStore()
    const draft = store.getState().draft
    store
      .getState()
      .replaceWithAttachment(
        { draftId: draft.draftId, revision: draft.revision },
        attachment(),
      )
    store.getState().updateOptions({ key: 'keep-key', ttlSeconds: null })

    expect(store.getState().removeAttachment()).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: {
        content: { kind: 'text', text: '' },
        options: { key: 'keep-key', ttlSeconds: null },
      },
    })
  })

  it('freezes content and options and rejects duplicate submissions', () => {
    const store = makeStore()
    store.getState().editText('payload')
    store.getState().confirmText()
    store.getState().updateOptions({ key: 'custom-key', ttlSeconds: null })

    const operation = store.getState().beginSend('session-one')

    expect(operation).toMatchObject({
      content: { kind: 'text', text: 'payload' },
      options: { key: 'custom-key', ttlSeconds: null, overwrite: false },
      sessionId: 'session-one',
    })
    expect(operation?.content).not.toBe(store.getState().draft.content)
    expect(operation?.options).not.toBe(store.getState().draft.options)
    expect(store.getState().beginSend('session-one')).toBeNull()
    store.getState().editText('changed too late')
    expect(operation?.content).toEqual({ kind: 'text', text: 'payload' })
  })

  it('accepts a result only for the current session and complete operation identity', () => {
    const store = makeStore()
    store.getState().editText('payload')
    store.getState().confirmText()
    const operation = store.getState().beginSend('session-one')
    expect(operation).not.toBeNull()
    if (!operation) return

    expect(
      store.getState().resolveSend(operation, 'session-two', {
        type: 'success',
        result: createdResult,
      }),
    ).toBe(false)
    expect(
      store
        .getState()
        .resolveSend(
          { ...operation, operationId: 'late-operation' },
          'session-one',
          { type: 'success', result: createdResult },
        ),
    ).toBe(false)
    expect(store.getState().phase).toBe('sending')

    expect(
      store.getState().resolveSend(operation, 'session-one', {
        type: 'success',
        result: createdResult,
      }),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'sent',
      result: { key: 'server-key' },
    })
  })

  it.each(['rejected', 'conflict', 'uncertain'] as const)(
    'keeps the draft after a %s outcome',
    (kind) => {
      const store = makeStore()
      store.getState().editText('keep me')
      store.getState().confirmText()
      const operation = store.getState().beginSend('session-one')
      if (!operation) throw new Error('Expected a send operation')

      store.getState().resolveSend(operation, 'session-one', {
        type: 'failure',
        failure: { kind, message: 'failure', requestId: null, status: null },
      })

      expect(store.getState()).toMatchObject({
        phase: kind === 'rejected' ? 'failed' : kind,
        draft: { content: { kind: 'text', text: 'keep me' } },
      })
    },
  )

  it('requires acknowledgement before an uncertain draft can send again', () => {
    const store = makeStore()
    store.getState().editText('possibly saved')
    store.getState().confirmText()
    const operation = store.getState().beginSend('session-one')
    if (!operation) throw new Error('Expected a send operation')
    store.getState().resolveSend(operation, 'session-one', {
      type: 'failure',
      failure: {
        kind: 'uncertain',
        message: 'unknown',
        requestId: null,
        status: null,
      },
    })

    expect(store.getState().beginSend('session-one')).toBeNull()
    store.getState().acknowledgeUncertain()
    expect(store.getState().phase).toBe('ready')
    expect(store.getState().beginSend('session-one')).not.toBeNull()
  })

  it('clears a session draft back to new defaults', () => {
    const store = makeStore()
    store.getState().editText('private draft')
    store.getState().confirmText()
    store.getState().updateOptions({ key: 'private-key', ttlSeconds: null })
    expect(store.getState().hasUnsentDraft()).toBe(true)

    store.getState().resetForSession()

    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: {
        content: { kind: 'text', text: '' },
        options: DEFAULT_SEND_OPTIONS,
        revision: 0,
      },
    })
    expect(store.getState().hasUnsentDraft()).toBe(false)
  })
})
