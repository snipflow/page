import { XMLValidator } from 'fast-xml-parser'
import { fileTypeFromBuffer } from 'file-type'
import {
  findFileTypeByExtension,
  getFileTypeDefinition,
  type FileTypeDefinition,
  type FileTypeId,
} from './file-types.ts'
import {
  ensureRawInputLimit,
  failRawConversion as fail,
  interpretRaw,
  type AttachmentTextEncoding,
  type ConvertedAttachmentBytes,
  type RawCandidate,
  type RawInterpretation,
  type TextToAttachmentParameters,
} from './raw-codecs.ts'
import { requireMimeType, sanitizeFilename } from './validation.ts'
export { estimateRawOutputSize, RawConversionError } from './raw-codecs.ts'
export type {
  AttachmentTextEncoding,
  ConvertedAttachmentBytes,
  RawCandidate,
  RawConversionErrorCode,
  RawInterpretation,
  TextToAttachmentParameters,
} from './raw-codecs.ts'

const AUTO_BINARY_TYPES = new Set<FileTypeId>([
  'png',
  'jpeg',
  'webp',
  'gif',
  'pdf',
  'zip',
  'gzip',
  'seven-zip',
  'rar',
])

function hasUnsafeXmlDeclaration(value: string) {
  return /<!DOCTYPE|<!ENTITY/i.test(value)
}

function validXml(value: string) {
  return (
    !hasUnsafeXmlDeclaration(value) && XMLValidator.validate(value) === true
  )
}

function validateStructuredText(fileTypeId: FileTypeId, value: string) {
  if (fileTypeId === 'json') {
    try {
      JSON.parse(value)
    } catch {
      fail('type-mismatch', '正文不是有效 JSON。')
    }
  }
  if ((fileTypeId === 'xml' || fileTypeId === 'svg') && !validXml(value)) {
    fail('type-mismatch', 'XML / SVG 结构无效，或包含不允许的声明。')
  }
  if (
    fileTypeId === 'svg' &&
    !/^(?:\s*<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(value)
  ) {
    fail('type-mismatch', '所选 SVG 与正文根元素不匹配。')
  }
}

function isTextDefinition(definition: FileTypeDefinition) {
  return (
    definition.group === 'text' ||
    definition.group === 'code' ||
    definition.id === 'markdown'
  )
}

async function detectedBinaryType(bytes: Uint8Array) {
  try {
    const detected = await fileTypeFromBuffer(bytes)
    return detected ? (findFileTypeByExtension(detected.ext)?.id ?? null) : null
  } catch {
    return null
  }
}

function filenameExtension(filename: string) {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 && dotIndex < filename.length - 1
    ? filename.slice(dotIndex + 1).toLowerCase()
    : null
}

function resolveFilename(
  value: string,
  definition: FileTypeDefinition,
): string {
  let filename: string
  try {
    filename = sanitizeFilename(value, '')
  } catch {
    fail('invalid-filename', '请输入安全的文件名。')
  }
  const extension = filenameExtension(filename)
  if (definition.id === 'custom') {
    if (!extension || !/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(extension)) {
      fail('invalid-filename', '自定义格式需要 1–32 位安全扩展名。')
    }
  } else if (!extension || !definition.extensions.includes(extension)) {
    fail(
      'invalid-filename',
      `文件名扩展名必须与 ${definition.label} 类型一致。`,
    )
  }
  return filename
}

function resolveContentType(
  definition: FileTypeDefinition,
  customMimeType: string,
) {
  if (definition.id === 'custom') {
    try {
      return requireMimeType(customMimeType || 'application/octet-stream')
    } catch {
      fail('invalid-mime', '请输入合法的 MIME 类型。')
    }
  }
  const mimeType = definition.mimeTypes[0]
  if (!mimeType) {
    fail('unsupported-type', '所选类型没有可用的 MIME。')
  }
  return isTextDefinition(definition) ? `${mimeType}; charset=utf-8` : mimeType
}

async function validateTargetBytes(
  definition: FileTypeDefinition,
  bytes: Uint8Array,
  interpretation: RawInterpretation,
) {
  if (interpretation === 'utf8' && !definition.conversion.allowUtf8Source) {
    fail('type-mismatch', `${definition.label} 不能由普通 UTF-8 文本伪装生成。`)
  }
  const detectedType = await detectedBinaryType(bytes)
  if (definition.id === 'custom') return

  if (isTextDefinition(definition)) {
    if (detectedType) {
      fail('type-mismatch', '检测到二进制格式，不能声明为文本类型。')
    }
    let decoded: string
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      fail('type-mismatch', '字节不是有效 UTF-8，不能声明为文本类型。')
    }
    validateStructuredText(definition.id, decoded)
    return
  }

  if (!detectedType || detectedType !== definition.id) {
    fail('type-mismatch', `字节特征与 ${definition.label} 类型不匹配。`)
  }
}

export async function convertTextToAttachment(
  text: string,
  parameters: TextToAttachmentParameters,
  maxObjectBytes: number,
): Promise<ConvertedAttachmentBytes> {
  const definition = getFileTypeDefinition(parameters.fileTypeId)
  if (definition.id === 'unknown') {
    fail('unsupported-type', '未知类型不能作为转换目标，请使用自定义格式。')
  }
  const bytes = interpretRaw(text, parameters.interpretation)
  if (bytes.byteLength === 0) {
    fail('empty-output', '转换结果为空，不能形成附件。')
  }
  if (bytes.byteLength > maxObjectBytes) {
    fail('size-limit', '转换结果超过当前对象大小限制。')
  }
  await validateTargetBytes(definition, bytes, parameters.interpretation)
  const filename = resolveFilename(parameters.filename, definition)
  const contentType = resolveContentType(definition, parameters.customMimeType)
  return {
    bytes: bytes.slice().buffer,
    contentType,
    fileTypeId: definition.id,
    filename,
  }
}

function structuredCandidate(text: string): RawCandidate | null {
  const trimmed = text.trim()
  if (/^(?:\{|\[)/.test(trimmed)) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed !== null && typeof parsed === 'object') {
        return {
          fileTypeId: 'json',
          filename: 'settings.json',
          interpretation: 'utf8',
        }
      }
    } catch {
      // Invalid JSON is not a candidate.
    }
  }
  if (hasUnsafeXmlDeclaration(trimmed) || !validXml(trimmed)) return null
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(trimmed)) {
    return {
      fileTypeId: 'svg',
      filename: 'image.svg',
      interpretation: 'utf8',
    }
  }
  if (/^<\?xml\s/i.test(trimmed)) {
    return {
      fileTypeId: 'xml',
      filename: 'document.xml',
      interpretation: 'utf8',
    }
  }
  return null
}

async function binaryCandidate(
  text: string,
  interpretation: Exclude<RawInterpretation, 'utf8'>,
): Promise<RawCandidate | null> {
  let interpreted: ReturnType<typeof interpretRaw>
  try {
    interpreted = interpretRaw(text, interpretation)
  } catch {
    return null
  }
  const detected = await fileTypeFromBuffer(interpreted).catch(() => undefined)
  const fileTypeId = detected
    ? findFileTypeByExtension(detected.ext)?.id
    : undefined
  if (!fileTypeId || !AUTO_BINARY_TYPES.has(fileTypeId)) return null
  const definition = getFileTypeDefinition(fileTypeId)
  return {
    fileTypeId,
    filename: `attachment.${definition.extensions[0] ?? detected?.ext ?? 'bin'}`,
    interpretation,
  }
}

export async function detectRawCandidate(text: string) {
  ensureRawInputLimit(text)
  const structured = structuredCandidate(text)
  if (structured) return structured
  if (/^data:/i.test(text.trim())) {
    return binaryCandidate(text.trim(), 'data-url')
  }
  const base64 = await binaryCandidate(text, 'base64')
  return base64 ?? binaryCandidate(text, 'hex')
}

function encodeBase64(bytes: Uint8Array) {
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    )
  }
  return globalThis.btoa(chunks.join(''))
}

export async function attachmentBytesToText(
  body: Blob,
  sourceText: string | null,
  encoding: AttachmentTextEncoding,
) {
  if (sourceText !== null) return sourceText
  const bytes = new Uint8Array(await body.arrayBuffer())
  if (encoding === 'base64') return encodeBase64(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('type-mismatch', '附件不是有效的 UTF-8 文本，原附件已保留。')
  }
}
