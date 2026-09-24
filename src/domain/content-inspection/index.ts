import { fileTypeFromBuffer } from 'file-type'
import {
  deriveContentType,
  findFileTypeByExtension,
  type DerivedContentType,
} from '../file-types/index.ts'
import { inspectImageBytes, type ImageDimensions } from './image.ts'
export type { ImageDimensions } from './image.ts'
import {
  getPreviewStrategy,
  resolvePreview,
  type PreviewIssue,
} from '../preview/index.ts'
export { MAX_RASTER_PIXELS } from '../preview/index.ts'
import {
  parseMimeType,
  sanitizeFilename,
  SnipValidationError,
} from '../validation.ts'

export const MAX_TEXT_PREVIEW_BYTES = 256 * 1024
const MAX_SIGNATURE_BYTES = 256 * 1024

export interface ContentInspection extends DerivedContentType {
  imageDimensions: ImageDimensions | null
  previewIssue: PreviewIssue
}

export interface InspectedBlob {
  fullText: string | null
  inspection: ContentInspection
  previewText: string | null
  previewTruncated: boolean
}

export interface InspectBlobInput {
  blob: Blob
  contentType: string
  disposition?: 'attachment' | 'inline' | null
  filename?: string | null
}

function hasBinaryControls(text: string) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true
  }
  return false
}

function patchMimeTypeForFilename(filename: string) {
  const extension = filename.split('.').at(-1)?.toLowerCase()
  if (extension === 'patch') return 'text/x-patch'
  if (extension === 'diff') return 'text/x-diff'
  return null
}

function isGenericAttachmentMime(contentType: string | null) {
  const essence = contentType ? parseMimeType(contentType)?.essence : null
  return (
    essence === null ||
    essence === 'application/octet-stream' ||
    essence === 'binary/octet-stream'
  )
}

async function detectSignature(bytes: Uint8Array) {
  const image = inspectImageBytes(bytes)
  if (image) return image

  const detected = await fileTypeFromBuffer(bytes).catch(() => undefined)
  const definition = detected ? findFileTypeByExtension(detected.ext) : null
  return {
    fileTypeId: definition?.id ?? null,
    dimensions: null as ImageDimensions | null,
  }
}

function isTextCandidate(derived: DerivedContentType) {
  return getPreviewStrategy(derived.fileType.previewKind).input === 'text'
}

function decodePreview(bytes: Uint8Array, decoder: TextDecoder) {
  if (bytes.byteLength <= MAX_TEXT_PREVIEW_BYTES) {
    return { text: decoder.decode(bytes), truncated: false }
  }

  const previewBytes = bytes.subarray(0, MAX_TEXT_PREVIEW_BYTES)
  for (let tail = 0; tail <= 3; tail += 1) {
    try {
      return {
        text: decoder.decode(
          previewBytes.subarray(0, previewBytes.length - tail),
        ),
        truncated: true,
      }
    } catch {
      // A UTF-8 code point can straddle the byte budget by at most three bytes.
    }
  }
  return { text: '', truncated: true }
}

export async function readBlobTextPreview(blob: Blob, contentType: string) {
  const charset =
    parseMimeType(contentType)?.parameters.get('charset') ?? 'utf-8'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  new TextDecoder(charset, { fatal: true }).decode(bytes)
  return decodePreview(bytes, new TextDecoder(charset, { fatal: true }))
}

export function createTextPreview(value: string) {
  const bytes = new TextEncoder().encode(value)
  return decodePreview(bytes, new TextDecoder('utf-8', { fatal: true }))
}

export async function inspectBlob({
  blob,
  contentType,
  disposition = null,
  filename = null,
}: InspectBlobInput): Promise<InspectedBlob> {
  const signatureBuffer = await blob
    .slice(0, Math.min(blob.size, MAX_SIGNATURE_BYTES))
    .arrayBuffer()
  const signatureBytes = new Uint8Array(signatureBuffer)
  const signature = await detectSignature(signatureBytes)
  const initial = deriveContentType({
    contentType,
    disposition,
    filename,
    signatureFileType: signature.fileTypeId,
    utf8Decodable: null,
  })

  let fullText: string | null = null
  let previewText: string | null = null
  let previewTruncated = false
  let utf8Decodable: boolean | null = null
  let previewIssue: PreviewIssue = null

  if (isTextCandidate(initial)) {
    const charset =
      parseMimeType(contentType)?.parameters.get('charset') ?? 'utf-8'
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const decoder = new TextDecoder(charset, { fatal: true })
      fullText = decoder.decode(bytes)
      const preview = decodePreview(
        bytes,
        new TextDecoder(charset, { fatal: true }),
      )
      previewText = preview.text
      previewTruncated = preview.truncated
      utf8Decodable = true
    } catch {
      utf8Decodable = false
      previewIssue = 'decode-failed'
    }
  }

  const derived = deriveContentType({
    contentType,
    disposition,
    filename,
    signatureFileType: signature.fileTypeId,
    utf8Decodable,
  })
  if (
    /\.ts$/i.test(filename ?? '') &&
    ['video/vnd.dlna.mpeg-tts', 'video/mp2t'].includes(
      parseMimeType(contentType)?.essence ?? '',
    ) &&
    !signature.fileTypeId &&
    (utf8Decodable === false ||
      (fullText !== null && hasBinaryControls(fullText)))
  ) {
    Object.assign(
      derived,
      deriveContentType({ contentType, disposition: 'attachment' }),
    )
    fullText = null
    previewText = null
  }
  const preview = resolvePreview(derived.previewKind, {
    blob,
    text: previewText,
    imageDimensions: signature.dimensions,
    issue: previewIssue,
  })

  return {
    fullText,
    previewText,
    previewTruncated,
    inspection: {
      ...derived,
      previewKind: preview.kind,
      imageDimensions: signature.dimensions,
      previewIssue: preview.issue,
    },
  }
}

export async function prepareAttachmentDraft(
  file: File,
  maxObjectBytes: number,
) {
  if (file.size === 0) {
    throw new SnipValidationError('body', 'Empty files cannot be sent')
  }
  if (file.size > maxObjectBytes) {
    throw new SnipValidationError(
      'size',
      'File exceeds the configured size limit',
    )
  }

  const filename = sanitizeFilename(file.name, 'attachment.bin')
  const suppliedContentType = parseMimeType(file.type) ? file.type.trim() : null
  const genericContentType = isGenericAttachmentMime(suppliedContentType)
  let contentType = genericContentType
    ? 'application/octet-stream'
    : suppliedContentType!
  if (parseMimeType(contentType)?.essence === 'application/x-zip-compressed') {
    contentType = 'application/zip'
  }
  const { inspection, fullText } = await inspectBlob({
    blob: file,
    contentType,
    disposition: 'attachment',
    filename,
  })

  const inferredContentType = inspection.fileType.mimeTypes[0]
  if (genericContentType && fullText !== null && inferredContentType) {
    contentType = inferredContentType
  }

  if (
    /\.ts$/i.test(filename) &&
    ['video/vnd.dlna.mpeg-tts', 'video/mp2t'].includes(
      parseMimeType(contentType)?.essence ?? '',
    ) &&
    inspection.fileType.id === 'typescript' &&
    fullText !== null &&
    !hasBinaryControls(fullText)
  ) {
    contentType = 'text/typescript; charset=utf-8'
  }

  const patchMimeType = patchMimeTypeForFilename(filename)
  if (patchMimeType && genericContentType && fullText !== null) {
    contentType = patchMimeType
  }

  return {
    kind: 'attachment' as const,
    body: file,
    contentType,
    filename,
    inspection,
    previewVersion: 0,
    sourceText: null,
  }
}
