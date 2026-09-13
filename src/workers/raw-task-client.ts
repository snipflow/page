import {
  matchesRawTaskIdentity,
  taskIdentity,
  type RawTaskRequest,
  type RawTaskResponse,
} from './raw-task-types.ts'

export const RAW_TASK_TIMEOUT_MS = 2_000

export class RawTaskClientError extends Error {
  readonly code: 'aborted' | 'invalid-response' | 'timeout' | 'worker-failed'

  constructor(code: RawTaskClientError['code'], message: string) {
    super(message)
    this.name = 'RawTaskClientError'
    this.code = code
  }
}

export interface RunRawTaskOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

function timeoutResponse(request: RawTaskRequest): RawTaskResponse {
  return {
    ...taskIdentity(request),
    code: 'timeout',
    kind: request.kind,
    message: '本地内容处理超过 2 秒，已终止。',
    ok: false,
  }
}

function runInProcess(
  request: RawTaskRequest,
  { signal, timeoutMs = RAW_TASK_TIMEOUT_MS }: RunRawTaskOptions,
) {
  return new Promise<RawTaskResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RawTaskClientError('aborted', '任务已取消。'))
      return
    }
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () =>
      finish(() => reject(new RawTaskClientError('aborted', '任务已取消。')))
    const timer = globalThis.setTimeout(
      () => finish(() => resolve(timeoutResponse(request))),
      timeoutMs,
    )
    signal?.addEventListener('abort', abort, { once: true })
    void import('./raw-task-handler.ts')
      .then(({ handleRawTask }) => handleRawTask(request))
      .then(
        (response) => finish(() => resolve(response)),
        () =>
          finish(() =>
            reject(
              new RawTaskClientError('worker-failed', '本地内容处理失败。'),
            ),
          ),
      )
  })
}

export function runRawTask(
  request: RawTaskRequest,
  options: RunRawTaskOptions = {},
) {
  if (typeof Worker === 'undefined') {
    return runInProcess(request, options)
  }

  return new Promise<RawTaskResponse>((resolve, reject) => {
    const worker = new Worker(
      new URL('./raw-content.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const { signal, timeoutMs = RAW_TASK_TIMEOUT_MS } = options
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      callback()
    }
    const abort = () =>
      finish(() => reject(new RawTaskClientError('aborted', '任务已取消。')))
    const timer = globalThis.setTimeout(
      () => finish(() => resolve(timeoutResponse(request))),
      timeoutMs,
    )

    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<RawTaskResponse>) => {
      if (!matchesRawTaskIdentity(event.data, request)) {
        finish(() =>
          reject(
            new RawTaskClientError(
              'invalid-response',
              '本地任务返回了不匹配的结果。',
            ),
          ),
        )
        return
      }
      finish(() => resolve(event.data))
    }
    worker.onerror = () =>
      finish(() =>
        reject(new RawTaskClientError('worker-failed', '本地内容处理失败。')),
      )
    worker.postMessage(request)
  })
}
