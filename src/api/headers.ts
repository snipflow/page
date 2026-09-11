import type {
  ObjectResponseMetadata,
  PreparedUpload,
  SendOptions,
} from '../domain/models.ts'
import { inferExtensionFromContentType } from '../domain/file-types.ts'
import {
  encodeFilenameHeader,
  fallbackDownloadFilename,
  parseContentDispositionFilename,
  parseMimeType,
  requireByteSize,
  requireMimeType,
  requireSnipKey,
  requireTtlSeconds,
} from '../domain/validation.ts'

interface CreateHeadersInput {
  token: string
  upload: PreparedUpload
  options: SendOptions
  source?: string
}

export function buildAuthorizationHeaders(token: string): Headers {
  const hasControlCharacter = [...token].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })
  if (!token || hasControlCharacter) {
    throw new TypeError('A valid runtime token is required')
  }

  return new Headers({ Authorization: `Bearer ${token}` })
}

export function buildCreateHeaders({
  token,
  upload,
  options,
  source = 'page',
}: CreateHeadersInput): Headers {
  if (!source || [...source].length > 256) {
    throw new TypeError('Source must contain 1-256 characters')
  }

  const headers = buildAuthorizationHeaders(token)
  headers.set('Content-Type', requireMimeType(upload.contentType))
  headers.set('X-Snip-Source', source)

  if (upload.filename !== null) {
    headers.set('X-Snip-Filename', encodeFilenameHeader(upload.filename))
  }
  if (options.key !== null) {
    headers.set('X-Snip-Key', requireSnipKey(options.key))
  }
  if (options.ttlSeconds !== null) {
    headers.set('X-Snip-TTL', String(requireTtlSeconds(options.ttlSeconds)))
  }
  if (options.overwrite) {
    headers.set('X-Snip-Overwrite', 'true')
  }

  return headers
}

function parseContentLength(value: string | null, issues: string[]) {
  if (value === null) {
    return null
  }

  const parsed = Number(value)
  try {
    return requireByteSize(parsed)
  } catch {
    issues.push('invalid-content-length')
    return null
  }
}

export function parseObjectResponseMetadata(
  key: string,
  headers: Headers,
): ObjectResponseMetadata {
  const issues: string[] = []
  const rawContentType = headers.get('content-type')
  const parsedContentType = rawContentType
    ? parseMimeType(rawContentType)
    : null
  const contentType =
    rawContentType !== null && parsedContentType !== null
      ? rawContentType.trim()
      : 'application/octet-stream'
  if (!parsedContentType) {
    issues.push('invalid-content-type')
  }

  const contentDisposition = headers.get('content-disposition')
  const serverFilename = parseContentDispositionFilename(contentDisposition)
  const inferredExtension = inferExtensionFromContentType(contentType) ?? 'bin'

  return {
    contentType,
    contentDisposition,
    contentLength: parseContentLength(headers.get('content-length'), issues),
    etag: headers.get('etag'),
    serverFilename,
    downloadFilename:
      serverFilename ?? fallbackDownloadFilename(key, inferredExtension),
    issues,
  }
}
