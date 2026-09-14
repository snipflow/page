import {
  RAW_WORKER_STARTUP_TIMEOUT_MS,
  RawTaskClientError,
  runRawTask,
} from './raw-task-client.ts'
import type { RawTaskRequest, RawTaskResponse } from './raw-task-types.ts'

type WorkerMessage = RawTaskResponse | { kind: 'ready' }

function workerMessage(data: WorkerMessage) {
  return new MessageEvent<WorkerMessage>('message', { data })
}

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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('raw task client', () => {
  it('terminates a silent worker at the deadline and returns the full identity', async () => {
    const terminate = vi.fn<() => void>()

    class SilentWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
      constructor() {
        queueMicrotask(() => this.onmessage?.(workerMessage({ kind: 'ready' })))
      }
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
      onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null

      constructor() {
        queueMicrotask(() => this.onmessage?.(workerMessage({ kind: 'ready' })))
      }

      postMessage() {
        queueMicrotask(() => {
          this.onmessage?.(
            workerMessage({
              ...detectionRequest(),
              candidate: null,
              kind: 'detect',
              ok: true,
              operationId: 'other-operation',
            }),
          )
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
      onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
      constructor() {
        queueMicrotask(() => this.onmessage?.(workerMessage({ kind: 'ready' })))
      }
      postMessage() {}
      terminate = terminate
    }

    vi.stubGlobal('Worker', SilentWorker)
    const controller = new AbortController()
    const result = runRawTask(detectionRequest(), {
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort()

    await expect(result).rejects.toMatchObject<Partial<RawTaskClientError>>({
      code: 'aborted',
    })
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('terminates a Worker that misses startup and ignores a late ready signal', async () => {
    vi.useFakeTimers()
    const terminate = vi.fn<() => void>()
    const postMessage = vi.fn<(message: unknown) => void>()

    class LateReadyWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
      constructor() {
        globalThis.setTimeout(
          () => this.onmessage?.(workerMessage({ kind: 'ready' })),
          RAW_WORKER_STARTUP_TIMEOUT_MS + 1,
        )
      }
      postMessage = postMessage
      terminate = terminate
    }

    vi.stubGlobal('Worker', LateReadyWorker)
    const result = runRawTask(detectionRequest())
    await vi.advanceTimersByTimeAsync(RAW_WORKER_STARTUP_TIMEOUT_MS)

    await expect(result).resolves.toMatchObject({ code: 'timeout', ok: false })
    await vi.advanceTimersByTimeAsync(1)
    expect(postMessage).not.toHaveBeenCalled()
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('starts the task deadline only after the Worker reports ready', async () => {
    vi.useFakeTimers()
    const terminate = vi.fn<() => void>()

    class SlowStartingWorker {
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null

      constructor() {
        globalThis.setTimeout(
          () => this.onmessage?.(workerMessage({ kind: 'ready' })),
          50,
        )
      }

      postMessage() {
        globalThis.setTimeout(
          () =>
            this.onmessage?.(
              workerMessage({
                ...detectionRequest(),
                candidate: null,
                kind: 'detect',
                ok: true,
              }),
            ),
          1,
        )
      }

      terminate = terminate
    }

    vi.stubGlobal('Worker', SlowStartingWorker)
    const result = runRawTask(detectionRequest(), { timeoutMs: 10 })

    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toMatchObject({ kind: 'detect', ok: true })
    expect(terminate).toHaveBeenCalledOnce()
  })
})
