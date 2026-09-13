import type {
  AttachmentTextEncoding,
  ConvertedAttachmentBytes,
  RawCandidate,
  RawConversionErrorCode,
  TextToAttachmentParameters,
} from '../domain/raw-codecs.ts'

export interface RawTaskIdentity {
  draftId: string
  operationId: string
  revision: number
  sessionId: string
}

export type RawTaskRequest =
  | (RawTaskIdentity & {
      kind: 'detect'
      text: string
    })
  | (RawTaskIdentity & {
      kind: 'text-to-attachment'
      maxObjectBytes: number
      parameters: TextToAttachmentParameters
      text: string
    })
  | (RawTaskIdentity & {
      body: Blob
      encoding: AttachmentTextEncoding
      kind: 'attachment-to-text'
      sourceText: string | null
    })

export type RawTaskSuccess =
  | (RawTaskIdentity & {
      candidate: RawCandidate | null
      kind: 'detect'
      ok: true
    })
  | (RawTaskIdentity & {
      attachment: ConvertedAttachmentBytes
      kind: 'text-to-attachment'
      ok: true
    })
  | (RawTaskIdentity & {
      kind: 'attachment-to-text'
      ok: true
      text: string
    })

export type RawTaskFailure = RawTaskIdentity & {
  code: RawConversionErrorCode | 'task-failed' | 'timeout'
  kind: RawTaskRequest['kind']
  message: string
  ok: false
}

export type RawTaskResponse = RawTaskSuccess | RawTaskFailure

export function taskIdentity(request: RawTaskRequest): RawTaskIdentity {
  return {
    draftId: request.draftId,
    operationId: request.operationId,
    revision: request.revision,
    sessionId: request.sessionId,
  }
}

export function matchesRawTaskIdentity(
  response: RawTaskResponse,
  request: RawTaskRequest,
) {
  return (
    response.kind === request.kind &&
    response.sessionId === request.sessionId &&
    response.draftId === request.draftId &&
    response.revision === request.revision &&
    response.operationId === request.operationId
  )
}
