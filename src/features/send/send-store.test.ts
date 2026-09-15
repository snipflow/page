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
    previewVersion: 0,
    sourceText: null,
  }
}

function unknownAttachment(body = new Blob([new Uint8Array([0, 255, 16])])) {
  return {
    ...attachment(body),
    contentType: 'application/octet-stream',
    filename: 'payload.bin',
    inspection: {
      ...deriveContentType({
        contentType: 'application/octet-stream',
        disposition: 'attachment',
        filename: 'payload.bin',
      }),
      imageDimensions: null,
      previewIssue: null,
    },
  }
}

function prepareAttachment(
  store: ReturnType<typeof makeStore>,
  content = attachment(),
) {
  const operation = store.getState().beginPreparation('session-one')
  if (!operation) throw new Error('Expected an attachment preparation')
  if (!store.getState().resolvePreparation(operation, content)) {
    throw new Error('Expected attachment preparation to resolve')
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
    expect(store.getState().startTextConversion('session-one')).toBe(false)
    expect(store.getState().beginSend('session-one')).toBeNull()
  })

  it('resolves attachment preparation only for its exact operation', () => {
    const store = makeStore()
    const operation = store.getState().beginPreparation('session-one')
    if (!operation) throw new Error('Expected an attachment preparation')

    expect(
      store
        .getState()
        .resolvePreparation(
          { ...operation, operationId: 'stale-operation' },
          attachment(),
        ),
    ).toBe(false)
    expect(store.getState().phase).toBe('preparing')

    const body = new Blob(['exact bytes'])
    expect(
      store.getState().resolvePreparation(operation, attachment(body)),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      draft: { content: { filename: 'notes.md', kind: 'attachment' } },
    })
    expect(store.getState().draft.content).toMatchObject({ body })
  })

  it('starts a new blank draft after discarding prepared content', () => {
    const store = makeStore()
    prepareAttachment(store)
    store.getState().updateOptions({ key: 'keep-key', ttlSeconds: null })

    store.getState().startNewDraft()

    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: {
        content: { kind: 'text', text: '' },
        options: DEFAULT_SEND_OPTIONS,
        revision: 0,
      },
    })
    expect(store.getState().draft.draftId).toBe('send-id-3')
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

  it('records a same-session result without replacing a newer draft', () => {
    const store = makeStore()
    store.getState().editText('old payload')
    store.getState().confirmText()
    const operation = store.getState().beginSend('session-one')
    if (!operation) throw new Error('Expected a send operation')

    store.getState().startNewDraft()
    expect(
      store.getState().resolveSend(operation, 'session-one', {
        type: 'success',
        result: createdResult,
      }),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: { content: { kind: 'text', text: '' } },
      operationRecords: {
        [operation.operationId]: {
          resolution: { type: 'success', result: { key: 'server-key' } },
        },
      },
    })
  })

  it('allows only key change, overwrite confirmation, or explicit exit from conflict', () => {
    const store = makeStore()
    store.getState().editText('conflicting payload')
    store.getState().confirmText()
    store.getState().updateOptions({ key: 'occupied', ttlSeconds: 3600 })
    const operation = store.getState().beginSend('session-one')
    if (!operation) throw new Error('Expected a send operation')
    store.getState().resolveSend(operation, 'session-one', {
      type: 'failure',
      failure: {
        kind: 'conflict',
        message: 'occupied',
        requestId: null,
        status: 409,
      },
    })

    store.getState().updateOptions({ ttlSeconds: null })
    expect(store.getState()).toMatchObject({
      phase: 'conflict',
      draft: { options: { ttlSeconds: 3600, overwrite: false } },
    })

    store.getState().enableOverwrite()
    const overwrite = store.getState().beginSend('session-one')
    expect(overwrite).toMatchObject({
      content: { kind: 'text', text: 'conflicting payload' },
      options: { key: 'occupied', ttlSeconds: 3600, overwrite: true },
    })

    if (!overwrite) throw new Error('Expected overwrite operation')
    store.getState().resolveSend(overwrite, 'session-one', {
      type: 'failure',
      failure: {
        kind: 'conflict',
        message: 'still occupied',
        requestId: null,
        status: 409,
      },
    })
    store.getState().updateOptions({ key: 'available' })
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      draft: { options: { key: 'available', overwrite: false } },
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

describe('send store local preparation and conversion', () => {
  it('updates attachment metadata without mutating bytes and freezes the result', () => {
    const store = makeStore()
    const content = unknownAttachment()
    prepareAttachment(store, content)

    expect(
      store.getState().updateAttachmentMetadata({
        contentType: 'application/x-custom-fixture',
        filename: 'renamed.fixture',
      }),
    ).toBe(true)
    const operation = store.getState().beginSend('session-one')

    expect(operation).toMatchObject({
      content: {
        contentType: 'application/x-custom-fixture',
        filename: 'renamed.fixture',
        inspection: { evidence: 'override', fileType: { id: 'custom' } },
      },
    })
    expect(
      operation?.content.kind === 'attachment' && operation.content.body,
    ).toBe(content.body)
    expect(
      store
        .getState()
        .updateAttachmentMetadata({ filename: 'too-late.fixture' }),
    ).toBe(false)
    expect(operation?.content).toMatchObject({ filename: 'renamed.fixture' })
  })

  it('restores the exact prior draft when attachment preparation is cancelled', () => {
    const store = makeStore()
    store.getState().editText('keep this source')
    const operation = store.getState().beginPreparation('session-one')

    expect(operation).not.toBeNull()
    expect(store.getState().phase).toBe('preparing')
    if (!operation) return
    expect(store.getState().cancelPreparation(operation)).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: { content: { kind: 'text', text: 'keep this source' } },
    })
  })

  it('converts text to the unified attachment model and restores its source', () => {
    const store = makeStore()
    store.getState().editText('{"enabled":true}')
    store.getState().confirmText()
    store.getState().updateOptions({ key: 'keep-key', ttlSeconds: null })

    expect(store.getState().startTextConversion('session-one')).toBe(true)
    store.getState().updateTextConversion({
      fileTypeId: 'json',
      filename: 'settings.json',
    })
    const operation = store.getState().beginTextConversion(1024)
    expect(operation).toMatchObject({
      parameters: { fileTypeId: 'json', filename: 'settings.json' },
      text: '{"enabled":true}',
    })
    if (!operation) return

    const converted = {
      ...attachment(new Blob(['{"enabled":true}'])),
      contentType: 'application/json',
      filename: 'settings.json',
    }
    expect(store.getState().completeTextConversion(operation, converted)).toBe(
      true,
    )
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      draft: {
        content: {
          contentType: 'application/json',
          kind: 'attachment',
          filename: 'settings.json',
          sourceText: '{"enabled":true}',
        },
        options: { key: 'keep-key', ttlSeconds: null },
      },
    })

    expect(store.getState().beginAttachmentToText('session-one')).toBe(true)
    const reverseState = store.getState()
    if (
      reverseState.phase !== 'converting' ||
      reverseState.conversion.direction !== 'attachment-to-text'
    ) {
      throw new Error('Expected an attachment-to-text conversion')
    }
    expect(reverseState.conversion.source.sourceText).toBe('{"enabled":true}')
    expect(reverseState.conversion.encoding).toBe('utf8')
    expect(
      store
        .getState()
        .completeAttachmentToText(
          reverseState.conversion.identity,
          reverseState.conversion.source.sourceText ?? '',
        ),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: {
        content: { kind: 'text', text: '{"enabled":true}' },
        options: { key: 'keep-key', ttlSeconds: null },
      },
    })
  })

  it('selects Base64 for a directly imported binary attachment', () => {
    const store = makeStore()
    const binary = {
      ...attachment(new Blob([new Uint8Array([0xff, 0x61])])),
      contentType: 'application/octet-stream',
      filename: 'binary.bin',
      inspection: {
        ...deriveContentType({
          contentType: 'application/octet-stream',
          disposition: 'attachment',
          filename: 'binary.bin',
          utf8Decodable: null,
        }),
        imageDimensions: null,
        previewIssue: null,
      },
    }
    prepareAttachment(store, binary)

    expect(store.getState().beginAttachmentToText('session-one')).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'converting',
      conversion: {
        encoding: 'base64',
        source: { sourceText: null },
      },
    })
  })

  it('restores the exact attachment after attachment-to-text fails', () => {
    const store = makeStore()
    const body = new Blob([new Uint8Array([0xff, 0x61])])
    const binary = {
      ...attachment(body),
      contentType: 'application/octet-stream',
      filename: 'binary.bin',
    }
    prepareAttachment(store, binary)
    store.getState().updateOptions({ key: 'keep-key', ttlSeconds: null })

    expect(store.getState().beginAttachmentToText('session-one')).toBe(true)
    const converting = store.getState()
    if (
      converting.phase !== 'converting' ||
      converting.conversion.direction !== 'attachment-to-text'
    ) {
      throw new Error('Expected an attachment-to-text conversion')
    }

    expect(
      store.getState().failAttachmentToText(converting.conversion.identity),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      draft: {
        content: { body, filename: 'binary.bin', kind: 'attachment' },
        options: { key: 'keep-key', ttlSeconds: null },
      },
    })
  })

  it('suppresses a rejected automatic recommendation until the text changes', () => {
    const store = makeStore()
    store.getState().editText('{}')
    const candidate = {
      fileTypeId: 'json' as const,
      filename: 'settings.json',
      interpretation: 'utf8' as const,
    }

    const draft = store.getState().draft
    expect(
      store.getState().dismissRawRecommendation({
        draftId: draft.draftId,
        revision: draft.revision - 1,
      }),
    ).toBe(false)
    expect(store.getState().dismissRawRecommendation(draft)).toBe(true)
    expect(store.getState().startTextConversion('session-one', candidate)).toBe(
      false,
    )
    expect(store.getState().confirmText()).toBe(true)
    store.getState().reopenEditing()
    expect(store.getState().startTextConversion('session-one', candidate)).toBe(
      false,
    )
    store.getState().editText('{"changed":true}')
    expect(store.getState().startTextConversion('session-one', candidate)).toBe(
      true,
    )
  })

  it('rejects a stale conversion result after the session draft resets', () => {
    const store = makeStore()
    store.getState().editText('payload')
    store.getState().confirmText()
    store.getState().startTextConversion('session-one')
    const operation = store.getState().beginTextConversion(1024)
    if (!operation) throw new Error('Expected conversion operation')

    store.getState().resetForSession()
    expect(
      store.getState().completeTextConversion(operation, attachment()),
    ).toBe(false)
    expect(store.getState()).toMatchObject({
      phase: 'editing',
      draft: { content: { kind: 'text', text: '' } },
    })
  })
})
