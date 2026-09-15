import { fileTypeFromBuffer } from 'file-type'
import {
  FILE_TYPE_DEFINITIONS,
  findFileTypeByExtension,
  getFileTypeDefinition,
  isTextFileType,
  type FileTypeDefinition,
} from '../file-types/index.ts'
import { getFileTypeAdapter } from '../file-types/adapters.ts'
import {
  ensureRawInputLimit,
  failRawConversion as fail,
  interpretRaw,
  type AttachmentTextEncoding,
  type ConvertedAttachmentBytes,
  type RawCandidate,
  type RawInterpretation,
  type TextToAttachmentParameters,
} from './codecs.ts'
import {
  requireMimeType,
  sanitizeFilename,
  textByteSize,
} from '../validation.ts'
export {
  estimateRawOutputSize,
  getBase64DataUrlMimeType,
  RawConversionError,
} from './codecs.ts'
export type {
  AttachmentTextEncoding,
  ConvertedAttachmentBytes,
  RawCandidate,
  RawConversionErrorCode,
  RawInterpretation,
  TextToAttachmentParameters,
} from './codecs.ts'

function validateStructuredText(definition: FileTypeDefinition, value: string) {
  const message = getFileTypeAdapter(definition.adapter)?.validateText?.(value)
  if (message) fail('type-mismatch', message)
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
  return mimeType
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

  if (isTextFileType(definition)) {
    if (detectedType) {
      fail('type-mismatch', '检测到二进制格式，不能声明为文本类型。')
    }
    let decoded: string
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      fail('type-mismatch', '字节不是有效 UTF-8，不能声明为文本类型。')
    }
    validateStructuredText(definition, decoded)
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
  const definitions = FILE_TYPE_DEFINITIONS.filter(
    (definition) => definition.autoRecommend && definition.adapter,
  ).sort(
    (left, right) =>
      (left.autoRecommendPriority ?? Number.MAX_SAFE_INTEGER) -
      (right.autoRecommendPriority ?? Number.MAX_SAFE_INTEGER),
  )

  for (const definition of definitions) {
    const seed = getFileTypeAdapter(definition.adapter)?.detectText?.(text)
    if (seed) {
      return {
        fileTypeId: definition.id,
        filename: seed.filename,
        interpretation: 'utf8',
      }
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
  const definition = detected ? findFileTypeByExtension(detected.ext) : null
  if (!definition || !definition.autoRecommend) return null
  return {
    fileTypeId: definition.id,
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
  maxObjectBytes: number,
) {
  if (sourceText !== null) {
    if (textByteSize(sourceText) > maxObjectBytes) {
      fail('size-limit', '恢复后的文本超过当前对象大小限制，原附件已保留。')
    }
    return sourceText
  }
  const outputBytes =
    encoding === 'base64' ? Math.ceil(body.size / 3) * 4 : body.size
  if (outputBytes > maxObjectBytes) {
    fail('size-limit', '转换后的文本超过当前对象大小限制，原附件已保留。')
  }
  const bytes = new Uint8Array(await body.arrayBuffer())
  if (encoding === 'base64') return encodeBase64(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('type-mismatch', '附件不是有效的 UTF-8 文本，原附件已保留。')
  }
}
