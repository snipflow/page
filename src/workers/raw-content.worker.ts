import { handleRawTask } from './raw-task-handler.ts'
import type { RawTaskRequest } from './raw-task-types.ts'

interface WorkerScope {
  onmessage: ((event: MessageEvent<RawTaskRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope

scope.postMessage({ kind: 'ready' })

scope.onmessage = (event) => {
  void handleRawTask(event.data).then((response) => {
    if (response.ok && response.kind === 'text-to-attachment') {
      scope.postMessage(response, [response.attachment.bytes])
    } else {
      scope.postMessage(response)
    }
  })
}
