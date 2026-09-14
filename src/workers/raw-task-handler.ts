import {
  attachmentBytesToText,
  convertTextToAttachment,
  detectRawCandidate,
  RawConversionError,
} from '../domain/raw-conversion.ts'
import {
  taskIdentity,
  type RawTaskRequest,
  type RawTaskResponse,
} from './raw-task-types.ts'

export async function handleRawTask(
  request: RawTaskRequest,
): Promise<RawTaskResponse> {
  const identity = taskIdentity(request)
  try {
    switch (request.kind) {
      case 'detect':
        return {
          ...identity,
          candidate: await detectRawCandidate(request.text),
          kind: request.kind,
          ok: true,
        }
      case 'text-to-attachment':
        return {
          ...identity,
          attachment: await convertTextToAttachment(
            request.text,
            request.parameters,
            request.maxObjectBytes,
          ),
          kind: request.kind,
          ok: true,
        }
      case 'attachment-to-text':
        return {
          ...identity,
          kind: request.kind,
          ok: true,
          text: await attachmentBytesToText(
            request.body,
            request.sourceText,
            request.encoding,
            request.maxObjectBytes,
          ),
        }
    }
  } catch (error) {
    return {
      ...identity,
      code: error instanceof RawConversionError ? error.code : 'task-failed',
      kind: request.kind,
      message: error instanceof Error ? error.message : '本地内容处理未完成。',
      ok: false,
    }
  }
}
