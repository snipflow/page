import {
  deriveContentType,
  type DerivedContentType,
  type FileTypeId,
} from './file-types.ts'
import {
  parseMimeType,
  sanitizeFilename,
  SnipValidationError,
} from './validation.ts'

export const MAX_TEXT_PREVIEW_BYTES = 256 * 1024
export const MAX_RASTER_PIXELS = 24_000_000
const MAX_SIGNATURE_BYTES = 256 * 1024

export interface ImageDimensions {
  height: number
  width: number
}

export interface ContentInspection extends DerivedContentType {
  imageDimensions: ImageDimensions | null
  previewIssue:
    | 'decode-failed'
    | 'inspection-failed'
    | 'pixel-limit'
    | 'unknown-dimensions'
    | null
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

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function uint24LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  )
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!hasPrefix(bytes, [0xff, 0xd8])) return null

  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) break

    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isStartOfFrame && segmentLength >= 7 && offset + 6 < bytes.length) {
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      }
    }
    if (segmentLength < 2) break
    offset += segmentLength
  }
  return null
}

function inspectRaster(
  bytes: Uint8Array,
): { dimensions: ImageDimensions | null; fileTypeId: FileTypeId } | null {
  if (
    bytes.length >= 24 &&
    hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    ascii(bytes, 12, 4) === 'IHDR'
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      fileTypeId: 'png',
      dimensions: {
        width: view.getUint32(16),
        height: view.getUint32(20),
      },
    }
  }

  if (
    bytes.length >= 10 &&
    (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      fileTypeId: 'gif',
      dimensions: {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      },
    }
  }

  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8X') {
      return {
        fileTypeId: 'webp',
        dimensions: {
          width: uint24LittleEndian(bytes, 24) + 1,
          height: uint24LittleEndian(bytes, 27) + 1,
        },
      }
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const b1 = bytes[21] ?? 0
      const b2 = bytes[22] ?? 0
      const b3 = bytes[23] ?? 0
      const b4 = bytes[24] ?? 0
      return {
        fileTypeId: 'webp',
        dimensions: {
          width: 1 + (((b2 & 0x3f) << 8) | b1),
          height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)),
        },
      }
    }
    if (
      chunk === 'VP8 ' &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        fileTypeId: 'webp',
        dimensions: {
          width: (((bytes[27] ?? 0) << 8) | (bytes[26] ?? 0)) & 0x3fff,
          height: (((bytes[29] ?? 0) << 8) | (bytes[28] ?? 0)) & 0x3fff,
        },
      }
    }
    return { fileTypeId: 'webp', dimensions: null }
  }

  if (hasPrefix(bytes, [0xff, 0xd8])) {
    return { fileTypeId: 'jpeg', dimensions: readJpegDimensions(bytes) }
  }
  return null
}

function detectSignature(
  bytes: Uint8Array,
  filename: string | null | undefined,
) {
  const raster = inspectRaster(bytes)
  if (raster) return raster
  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { fileTypeId: 'pdf' as const, dimensions: null }
  }
  if (hasPrefix(bytes, [0x1f, 0x8b])) {
    return { fileTypeId: 'gzip' as const, dimensions: null }
  }
  if (hasPrefix(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return { fileTypeId: 'seven-zip' as const, dimensions: null }
  }
  if (
    hasPrefix(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
    hasPrefix(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])
  ) {
    return { fileTypeId: 'rar' as const, dimensions: null }
  }
  if (
    hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    const extension = filename?.split('.').at(-1)?.toLowerCase()
    if (!['docx', 'xlsx', 'pptx'].includes(extension ?? '')) {
      return { fileTypeId: 'zip' as const, dimensions: null }
    }
  }
  return { fileTypeId: null, dimensions: null }
}

function isTextCandidate(derived: DerivedContentType) {
  return (
    derived.fileType.previewKind === 'plain-text' ||
    derived.fileType.previewKind === 'markdown'
  )
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
  const signature = detectSignature(signatureBytes, filename)
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
  let previewIssue: ContentInspection['previewIssue'] = null

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
  let previewKind = derived.previewKind
  if (previewKind === 'raster-image') {
    const dimensions = signature.dimensions
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      previewKind = 'metadata-only'
      previewIssue = 'unknown-dimensions'
    } else if (dimensions.width * dimensions.height > MAX_RASTER_PIXELS) {
      previewKind = 'metadata-only'
      previewIssue = 'pixel-limit'
    }
  }

  return {
    fullText,
    previewText,
    previewTruncated,
    inspection: {
      ...derived,
      previewKind,
      imageDimensions: signature.dimensions,
      previewIssue,
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
  let contentType = parseMimeType(file.type)
    ? file.type.trim()
    : 'application/octet-stream'
  if (parseMimeType(contentType)?.essence === 'application/x-zip-compressed') {
    contentType = 'application/zip'
  }
  const { inspection, fullText } = await inspectBlob({
    blob: file,
    contentType,
    disposition: 'attachment',
    filename,
  })

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

  return {
    kind: 'attachment' as const,
    body: file,
    contentType,
    filename,
    inspection,
  }
}
