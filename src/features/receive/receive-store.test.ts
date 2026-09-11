import { createReceiveStore } from './receive-store.ts'

function makeStore() {
  let sequence = 0
  return createReceiveStore({ createId: () => `receive-id-${++sequence}` })
}

describe('receive store', () => {
  it('deduplicates the same pending key', () => {
    const store = makeStore()
    store.getState().setInputKey('same-key')

    expect(store.getState().beginRead('session-one', 'same-key')).not.toBeNull()
    expect(store.getState().beginRead('session-one', 'same-key')).toBeNull()
  })

  it('does not let a delayed read replace a newer key', () => {
    const store = makeStore()
    const oldRead = store.getState().beginRead('session-one', 'old-key')
    const currentRead = store.getState().beginRead('session-one', 'new-key')
    if (!oldRead || !currentRead) throw new Error('Expected read operations')

    expect(
      store.getState().resolveRead(oldRead, 'session-one', { type: 'success' }),
    ).toBe(false)
    expect(store.getState()).toMatchObject({
      view: { status: 'loading', operation: { key: 'new-key' } },
    })

    expect(
      store
        .getState()
        .resolveRead(currentRead, 'session-one', { type: 'success' }),
    ).toBe(true)
    expect(store.getState()).toMatchObject({
      view: { status: 'result', result: { key: 'new-key' } },
    })
  })

  it('rejects read and delete results from a replaced session', () => {
    const store = makeStore()
    const read = store.getState().beginRead('session-one', 'text-object')
    if (!read) throw new Error('Expected a read operation')

    expect(
      store.getState().resolveRead(read, 'session-two', { type: 'success' }),
    ).toBe(false)
    expect(store.getState().view.status).toBe('loading')

    store.getState().resolveRead(read, 'session-one', { type: 'success' })
    store.getState().requestDelete()
    const deletion = store.getState().beginDelete('session-one')
    if (!deletion) throw new Error('Expected a delete operation')
    expect(
      store
        .getState()
        .resolveDelete(deletion, 'session-two', { type: 'success' }),
    ).toBe(false)
    expect(store.getState().deleteState.status).toBe('deleting')
  })

  it('returns to input after 204 and marks 404 as missing', () => {
    const store = makeStore()
    const firstRead = store.getState().beginRead('session-one', 'first-key')
    if (!firstRead) throw new Error('Expected a read operation')
    store.getState().resolveRead(firstRead, 'session-one', { type: 'success' })
    store.getState().requestDelete()
    const firstDelete = store.getState().beginDelete('session-one')
    if (!firstDelete) throw new Error('Expected a delete operation')
    store
      .getState()
      .resolveDelete(firstDelete, 'session-one', { type: 'success' })
    expect(store.getState()).toMatchObject({
      inputKey: 'first-key',
      view: { status: 'input' },
    })

    const secondRead = store.getState().beginRead('session-one', 'gone-key')
    if (!secondRead) throw new Error('Expected a read operation')
    store.getState().resolveRead(secondRead, 'session-one', { type: 'success' })
    store.getState().requestDelete()
    const secondDelete = store.getState().beginDelete('session-one')
    if (!secondDelete) throw new Error('Expected a delete operation')
    store.getState().resolveDelete(secondDelete, 'session-one', {
      type: 'missing',
      failure: { kind: 'missing', message: 'gone', requestId: null },
    })
    expect(store.getState()).toMatchObject({
      inputKey: 'gone-key',
      view: { status: 'error', failure: { kind: 'missing' } },
    })
  })

  it('keeps a result when deletion has an unknown outcome', () => {
    const store = makeStore()
    const read = store.getState().beginRead('session-one', 'kept-key')
    if (!read) throw new Error('Expected a read operation')
    store.getState().resolveRead(read, 'session-one', { type: 'success' })
    store.getState().requestDelete()
    const deletion = store.getState().beginDelete('session-one')
    if (!deletion) throw new Error('Expected a delete operation')

    store.getState().resolveDelete(deletion, 'session-one', {
      type: 'failure',
      uncertain: true,
      message: 'unknown',
    })

    expect(store.getState()).toMatchObject({
      view: { status: 'result', result: { key: 'kept-key' } },
      deleteState: { status: 'uncertain' },
    })
  })

  it('clears key and operation references on session cleanup', () => {
    const store = makeStore()
    store.getState().setInputKey('private-key')
    store.getState().beginRead('session-one', 'private-key')

    store.getState().resetForSession()

    expect(store.getState()).toMatchObject({
      inputKey: '',
      view: { status: 'input' },
      deleteState: { status: 'idle' },
    })
  })
})
