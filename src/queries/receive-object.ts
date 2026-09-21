import type { SnipApi, SnipReadCallbacks } from '../api/index.ts'
import {
  deriveContentType,
  type FileTypeId,
  inspectBlob,
  type ContentInspection,
  type ObjectResponseMetadata,
  type ReadSnipResponse,
} from '../domain/index.ts'

export interface ReceivedSnip {
  fullText: string | null
  inspection: ContentInspection
  object: ReadSnipResponse
  previewText: string | null
  previewTruncated: boolean
}

export function deriveReceivedFileType(
  metadata: ObjectResponseMetadata,
): FileTypeId {
  return deriveContentType({
    contentType: metadata.contentType,
    disposition: responseDisposition(metadata.contentDisposition),
    filename: metadata.serverFilename,
  }).fileType.id
}

function responseDisposition(value: string | null) {
  if (!value) return null
  return /^\s*attachment(?:;|$)/i.test(value) ? 'attachment' : 'inline'
}

export async function readReceivedSnip(
  api: SnipApi,
  key: string,
  signal?: AbortSignal,
  callbacks?: SnipReadCallbacks,
): Promise<ReceivedSnip> {
  const object = await api.read(key, signal, callbacks)
  try {
    const inspected = await inspectBlob({
      blob: object.body,
      contentType: object.metadata.contentType,
      disposition: responseDisposition(object.metadata.contentDisposition),
      filename: object.metadata.serverFilename,
    })
    return { object, ...inspected }
  } catch {
    const inspection = deriveContentType({
      contentType: object.metadata.contentType,
      disposition: responseDisposition(object.metadata.contentDisposition),
      filename: object.metadata.serverFilename,
      utf8Decodable: false,
    })
    return {
      object,
      fullText: null,
      previewText: null,
      previewTruncated: false,
      inspection: {
        ...inspection,
        previewKind: 'metadata-only',
        imageDimensions: null,
        previewIssue: 'inspection-failed',
      },
    }
  }
}
