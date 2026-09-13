import type { FileTypeId } from './file-types.ts'
import { parseMimeType, textByteSize } from './validation.ts'

const MAX_RAW_INPUT_BYTES = 24 * 1024 * 1024

export type RawInterpretation = 'base64' | 'data-url' | 'hex' | 'utf8'
export type AttachmentTextEncoding = 'base64' | 'utf8'

export interface RawCandidate {
  fileTypeId: FileTypeId
  filename: string
  interpretation: RawInterpretation
}

export interface TextToAttachmentParameters {
  customMimeType: string
  fileTypeId: FileTypeId
  filename: string
  interpretation: RawInterpretation
}

export interface ConvertedAttachmentBytes {
  bytes: ArrayBuffer
  contentType: string
  fileTypeId: FileTypeId
  filename: string
}

export type RawConversionErrorCode =
  | 'empty-output'
  | 'input-too-large'
  | 'invalid-base64'
  | 'invalid-data-url'
  | 'invalid-filename'
  | 'invalid-hex'
  | 'invalid-mime'
  | 'size-limit'
  | 'type-mismatch'
  | 'unsupported-type'

export class RawConversionError extends Error {
  readonly code: RawConversionErrorCode

  constructor(code: RawConversionErrorCode, message: string) {
    super(message)
    this.name = 'RawConversionError'
    this.code = code
  }
}

export function failRawConversion(
  code: RawConversionErrorCode,
  message: string,
): never {
  throw new RawConversionError(code, message)
}

export function ensureRawInputLimit(text: string) {
  if (textByteSize(text) > MAX_RAW_INPUT_BYTES) {
    failRawConversion(
      'input-too-large',
      '原文超过 24 MiB，无法执行 raw 检测或转换。',
    )
  }
}

function normalizeBase64(value: string) {
  const normalized = value.replace(/[\t\n\f\r ]/g, '')
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      normalized,
    )
  ) {
    failRawConversion('invalid-base64', 'Base64 必须使用标准字母表和合法填充。')
  }
  return normalized
}

function base64OutputSize(normalized: string) {
  const padding = normalized.endsWith('==')
    ? 2
    : normalized.endsWith('=')
      ? 1
      : 0
  return (normalized.length / 4) * 3 - padding
}

function decodeBase64(value: string) {
  const normalized = normalizeBase64(value)
  let binary: string
  try {
    binary = globalThis.atob(normalized)
  } catch {
    failRawConversion('invalid-base64', 'Base64 无法解码。')
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function base64DataUrlBody(value: string) {
  if (!value.startsWith('data:')) {
    failRawConversion('invalid-data-url', 'Data URL 必须以 data: 开头。')
  }
  const commaIndex = value.indexOf(',')
  if (commaIndex < 0) {
    failRawConversion('invalid-data-url', 'Data URL 缺少正文。')
  }
  const metadata = value.slice(5, commaIndex)
  const segments = metadata.split(';')
  if (segments.at(-1)?.toLowerCase() !== 'base64') {
    failRawConversion('invalid-data-url', '首版只支持 Base64 Data URL。')
  }
  const claimedMimeType = segments[0] || null
  if (claimedMimeType && !parseMimeType(claimedMimeType)) {
    failRawConversion('invalid-data-url', 'Data URL 的 MIME 无效。')
  }
  return value.slice(commaIndex + 1)
}

function normalizeHex(value: string) {
  const trimmed = value.trim().replace(/^0x/i, '')
  if (!trimmed) {
    failRawConversion('invalid-hex', '十六进制正文不能为空。')
  }
  const tokens = trimmed.split(/\s+/)
  const normalized =
    tokens.length > 1
      ? tokens.every((token) => /^[0-9a-fA-F]{2}$/.test(token))
        ? tokens.join('')
        : ''
      : (tokens[0] ?? '')
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(normalized)) {
    failRawConversion(
      'invalid-hex',
      '十六进制只接受连续偶数字符或空白分隔的两位字节。',
    )
  }
  return normalized
}

function decodeHex(value: string) {
  const normalized = normalizeHex(value)
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16,
    )
  }
  return bytes
}

export function interpretRaw(text: string, interpretation: RawInterpretation) {
  ensureRawInputLimit(text)
  switch (interpretation) {
    case 'utf8':
      return new TextEncoder().encode(text)
    case 'base64':
      return decodeBase64(text)
    case 'data-url':
      return decodeBase64(base64DataUrlBody(text))
    case 'hex':
      return decodeHex(text)
  }
}

export function estimateRawOutputSize(
  text: string,
  interpretation: RawInterpretation,
) {
  ensureRawInputLimit(text)
  switch (interpretation) {
    case 'utf8':
      return textByteSize(text)
    case 'base64':
      return base64OutputSize(normalizeBase64(text))
    case 'data-url':
      return base64OutputSize(normalizeBase64(base64DataUrlBody(text)))
    case 'hex':
      return normalizeHex(text).length / 2
  }
}
