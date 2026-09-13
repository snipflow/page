import { RawTaskClientError, runRawTask } from './raw-task-client.ts'
import type { RawTaskRequest, RawTaskResponse } from './raw-task-types.ts'

function detectionRequest(): Extract<RawTaskRequest, { kind: 'detect' }> {
  return {
    draftId: 'draft-one',
    kind: 'detect',
    operationId: 'operation-one',
    revision: 3,
    sessionId: 'session-one',
    text: 'ambiguous text',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('raw task client', () => {
  it('terminates a silent worker at the deadline and returns the full identity', async () => {
    const terminate = vi.fn<() => void>()

    class SilentWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<RawTaskResponse>) => void) | null = null
      postMessage() {}
      terminate = terminate
    }

    vi.stubGlobal('Worker', SilentWorker)
    const request = detectionRequest()
    const response = await runRawTask(request, { timeoutMs: 1 })

    expect(response).toMatchObject({
      code: 'timeout',
      draftId: request.draftId,
      kind: request.kind,
      ok: false,
      operationId: request.operationId,
      revision: request.revision,
      sessionId: request.sessionId,
    })
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('rejects a worker response whose operation identity does not match', async () => {
    const terminate = vi.fn<() => void>()

    class MismatchedWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<RawTaskResponse>) => void) | null = null

      postMessage() {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              ...detectionRequest(),
              candidate: null,
              ok: true,
              operationId: 'other-operation',
            },
          } as unknown as MessageEvent<RawTaskResponse>)
        })
      }

      terminate = terminate
    }

    vi.stubGlobal('Worker', MismatchedWorker)

    await expect(runRawTask(detectionRequest())).rejects.toMatchObject<
      Partial<RawTaskClientError>
    >({
      code: 'invalid-response',
    })
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('terminates and rejects an explicitly aborted worker', async () => {
    const terminate = vi.fn<() => void>()

    class SilentWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<RawTaskResponse>) => void) | null = null
      postMessage() {}
      terminate = terminate
    }

    vi.stubGlobal('Worker', SilentWorker)
    const controller = new AbortController()
    const result = runRawTask(detectionRequest(), {
      signal: controller.signal,
    })
    controller.abort()

    await expect(result).rejects.toMatchObject<Partial<RawTaskClientError>>({
      code: 'aborted',
    })
    expect(terminate).toHaveBeenCalledOnce()
  })
})
