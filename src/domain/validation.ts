const HTTP_TOKEN_PATTERN = /^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i

export const DEFAULT_MAX_OBJECT_BYTES = 10 * 1024 * 1024
export const MAX_SAFE_FILENAME_BYTES = 255

export type ValidationField =
  | 'body'
  | 'contentType'
  | 'createdAt'
  | 'expiresAt'
  | 'filename'
  | 'key'
  | 'size'
  | 'source'
  | 'ttl'

export class SnipValidationError extends Error {
  readonly field: ValidationField

  constructor(field: ValidationField, message: string) {
    super(message)
    this.name = 'SnipValidationError'
    this.field = field
  }
}

export interface ParsedMimeType {
  essence: string
  parameters: ReadonlyMap<string, string>
}

function splitHeaderParameters(value: string): string[] | null {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let escaped = false

  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }

    if (quoted && character === '\\') {
      current += character
      escaped = true
      continue
    }

    if (character === '"') {
      quoted = !quoted
      current += character
      continue
    }

    if (character === ';' && !quoted) {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  if (quoted || escaped) {
    return null
  }

  parts.push(current.trim())
  return parts
}

function parseHeaderValue(value: string): string | null {
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) {
      return null
    }

    let parsed = ''
    let escaped = false
    for (const character of value.slice(1, -1)) {
      if (escaped) {
        parsed += character
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else {
        parsed += character
      }
    }

    return escaped ? null : parsed
  }

  return HTTP_TOKEN_PATTERN.test(value) ? value : null
}

export function parseMimeType(value: string): ParsedMimeType | null {
  const parts = splitHeaderParameters(value.trim())
  if (!parts?.length) {
    return null
  }

  const [typePart, ...parameterParts] = parts
  if (!typePart) {
    return null
  }

  const slashIndex = typePart.indexOf('/')
  if (
    slashIndex <= 0 ||
    slashIndex !== typePart.lastIndexOf('/') ||
    !HTTP_TOKEN_PATTERN.test(typePart.slice(0, slashIndex)) ||
    !HTTP_TOKEN_PATTERN.test(typePart.slice(slashIndex + 1))
  ) {
    return null
  }

  const parameters = new Map<string, string>()
  for (const parameter of parameterParts) {
    const equalsIndex = parameter.indexOf('=')
    if (equalsIndex <= 0) {
      return null
    }

    const name = parameter.slice(0, equalsIndex).trim().toLowerCase()
    const parsedValue = parseHeaderValue(
      parameter.slice(equalsIndex + 1).trim(),
    )
    if (
      !HTTP_TOKEN_PATTERN.test(name) ||
      parsedValue === null ||
      parameters.has(name)
    ) {
      return null
    }
    parameters.set(name, parsedValue)
  }

  return {
    essence: typePart.toLowerCase(),
    parameters,
  }
}

export function requireMimeType(value: string): string {
  const trimmed = value.trim()
  if (!parseMimeType(trimmed)) {
    throw new SnipValidationError('contentType', 'Invalid MIME type')
  }
  return trimmed
}

export function requireSnipKey(value: string): string {
  if (!KEY_PATTERN.test(value)) {
    throw new SnipValidationError(
      'key',
      'Key must contain 1-128 letters, numbers, underscores, or hyphens',
    )
  }
  return value
}

export function requireTtlSeconds(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SnipValidationError('ttl', 'TTL must be a positive safe integer')
  }
  return value
}

export function requireByteSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SnipValidationError(
      'size',
      'Byte size must be a non-negative safe integer',
    )
  }
  return value
}

export function requireTimestamp(
  field: 'createdAt' | 'expiresAt',
  value: string,
): string {
  if (!TIMEZONE_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new SnipValidationError(
      field,
      'Timestamp must be valid and include a timezone',
    )
  }
  return value
}

export function textByteSize(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function parseMaxObjectBytes(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_MAX_OBJECT_BYTES
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new SnipValidationError(
      'size',
      'Object byte limit must be a positive safe integer',
    )
  }
  return parsed
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = ''
  let size = 0

  for (const character of value) {
    const characterSize = textByteSize(character)
    if (size + characterSize > maxBytes) {
      break
    }
    result += character
    size += characterSize
  }

  return result
}

function isControlCharacter(character: string) {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x1f || codePoint === 0x7f
}

export function sanitizeFilename(
  value: string,
  fallback = 'download.bin',
): string {
  const basename = value.replaceAll('\\', '/').split('/').at(-1) ?? ''
  const cleaned = [...basename]
    .filter((character) => !isControlCharacter(character))
    .join('')
    .replace(/^[\s.]+|[\s.]+$/g, '')

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    if (fallback === value) {
      throw new SnipValidationError('filename', 'Filename cannot be empty')
    }
    return sanitizeFilename(fallback, fallback)
  }

  if (textByteSize(cleaned) <= MAX_SAFE_FILENAME_BYTES) {
    return cleaned
  }

  const dotIndex = cleaned.lastIndexOf('.')
  const extension = dotIndex > 0 ? cleaned.slice(dotIndex) : ''
  const extensionSize = textByteSize(extension)
  const safeExtension = extensionSize < MAX_SAFE_FILENAME_BYTES ? extension : ''
  const stem = safeExtension ? cleaned.slice(0, dotIndex) : cleaned
  const truncated = `${truncateUtf8(
    stem,
    MAX_SAFE_FILENAME_BYTES - textByteSize(safeExtension),
  )}${safeExtension}`

  if (!truncated) {
    throw new SnipValidationError('filename', 'Filename cannot be empty')
  }
  return truncated
}

export function encodeFilenameHeader(value: string): string {
  return encodeURIComponent(sanitizeFilename(value))
}

function decodeExtendedFilename(value: string): string | null {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value)
  if (!match || match[1]?.toLowerCase() !== 'utf-8' || match[2] === undefined) {
    return null
  }

  try {
    return decodeURIComponent(match[2])
  } catch {
    return null
  }
}

export function parseContentDispositionFilename(
  value: string | null,
): string | null {
  if (!value) {
    return null
  }

  const parts = splitHeaderParameters(value)
  if (!parts?.length || !parts[0] || !HTTP_TOKEN_PATTERN.test(parts[0])) {
    return null
  }

  let regularFilename: string | null = null
  let extendedFilename: string | null = null

  for (const parameter of parts.slice(1)) {
    const equalsIndex = parameter.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }

    const name = parameter.slice(0, equalsIndex).trim().toLowerCase()
    const rawValue = parameter.slice(equalsIndex + 1).trim()
    const parsedValue = parseHeaderValue(rawValue)
    if (parsedValue === null) {
      continue
    }

    if (name === 'filename*') {
      extendedFilename = decodeExtendedFilename(parsedValue)
    } else if (name === 'filename') {
      regularFilename = parsedValue
    }
  }

  const filename = extendedFilename ?? regularFilename
  return filename ? sanitizeFilename(filename) : null
}

export function fallbackDownloadFilename(
  key: string,
  extension = 'bin',
): string {
  const validKey = requireSnipKey(key)
  const safeExtension = HTTP_TOKEN_PATTERN.test(extension) ? extension : 'bin'
  return sanitizeFilename(`${validKey}.${safeExtension}`)
}
