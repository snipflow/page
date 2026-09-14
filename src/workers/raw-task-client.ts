import {
  matchesRawTaskIdentity,
  taskIdentity,
  type RawTaskRequest,
  type RawTaskResponse,
} from './raw-task-types.ts'

export const RAW_TASK_TIMEOUT_MS = 2_000
export const RAW_WORKER_STARTUP_TIMEOUT_MS = 10_000

interface RawWorkerReady {
  kind: 'ready'
}

function isRawWorkerReady(
  message: RawTaskResponse | RawWorkerReady,
): message is RawWorkerReady {
  return message.kind === 'ready'
}

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

function startupTimeoutResponse(request: RawTaskRequest): RawTaskResponse {
  return {
    ...taskIdentity(request),
    code: 'timeout',
    kind: request.kind,
    message: '本地处理 Worker 启动超时，任务已终止。',
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
    let taskTimer: ReturnType<typeof globalThis.setTimeout> | null = null
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(startupTimer)
      if (taskTimer !== null) globalThis.clearTimeout(taskTimer)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () =>
      finish(() => reject(new RawTaskClientError('aborted', '任务已取消。')))
    const startupTimer = globalThis.setTimeout(
      () => finish(() => resolve(startupTimeoutResponse(request))),
      RAW_WORKER_STARTUP_TIMEOUT_MS,
    )
    signal?.addEventListener('abort', abort, { once: true })
    void import('./raw-task-handler.ts')
      .then(({ handleRawTask }) => {
        if (settled) return undefined
        globalThis.clearTimeout(startupTimer)
        taskTimer = globalThis.setTimeout(
          () => finish(() => resolve(timeoutResponse(request))),
          timeoutMs,
        )
        return handleRawTask(request)
      })
      .then(
        (response) => {
          if (response) finish(() => resolve(response))
        },
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
    let taskTimer: ReturnType<typeof globalThis.setTimeout> | null = null
    let workerReady = false
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(startupTimer)
      if (taskTimer !== null) globalThis.clearTimeout(taskTimer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      callback()
    }
    const abort = () =>
      finish(() => reject(new RawTaskClientError('aborted', '任务已取消。')))
    const startupTimer = globalThis.setTimeout(
      () => finish(() => resolve(startupTimeoutResponse(request))),
      RAW_WORKER_STARTUP_TIMEOUT_MS,
    )

    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (
      event: MessageEvent<RawTaskResponse | RawWorkerReady>,
    ) => {
      if (settled) return
      const message = event.data
      if (isRawWorkerReady(message)) {
        if (workerReady) return
        workerReady = true
        globalThis.clearTimeout(startupTimer)
        taskTimer = globalThis.setTimeout(
          () => finish(() => resolve(timeoutResponse(request))),
          timeoutMs,
        )
        try {
          worker.postMessage(request)
        } catch {
          finish(() =>
            reject(
              new RawTaskClientError(
                'worker-failed',
                '本地内容处理任务无法启动。',
              ),
            ),
          )
        }
        return
      }
      if (!workerReady) {
        finish(() =>
          reject(
            new RawTaskClientError(
              'invalid-response',
              '本地任务在 Worker 就绪前返回了结果。',
            ),
          ),
        )
        return
      }
      if (!matchesRawTaskIdentity(message, request)) {
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
      finish(() => resolve(message))
    }
    worker.onerror = () =>
      finish(() =>
        reject(new RawTaskClientError('worker-failed', '本地内容处理失败。')),
      )
  })
}
