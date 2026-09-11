import {
  DEFAULT_MAX_OBJECT_BYTES,
  MAX_SAFE_FILENAME_BYTES,
  SnipValidationError,
  encodeFilenameHeader,
  fallbackDownloadFilename,
  parseContentDispositionFilename,
  parseMaxObjectBytes,
  parseMimeType,
  requireByteSize,
  requireMimeType,
  requireSnipKey,
  requireTimestamp,
  requireTtlSeconds,
  sanitizeFilename,
  textByteSize,
} from './validation.ts'

describe('protocol validation', () => {
  it('parses MIME types and quoted parameters', () => {
    const parsed = parseMimeType('Text/Plain; charset="utf-8"')

    expect(parsed?.essence).toBe('text/plain')
    expect(parsed?.parameters.get('charset')).toBe('utf-8')
    expect(requireMimeType('application/json')).toBe('application/json')
  })

  it.each([
    '',
    'text',
    'text/',
    '/plain',
    'text/plain; charset',
    'text/plain; charset=utf-8; charset=ascii',
    'text/plain; note="unfinished',
  ])('rejects invalid MIME type %j', (value) => {
    expect(parseMimeType(value)).toBeNull()
    expect(() => requireMimeType(value)).toThrow(SnipValidationError)
  })

  it.each(['a', 'key_123-test', 'A'.repeat(128)])(
    'accepts valid key %j',
    (value) => {
      expect(requireSnipKey(value)).toBe(value)
    },
  )

  it.each(['', 'space key', 'a/b', 'A'.repeat(129)])(
    'rejects invalid key %j',
    (value) => {
      expect(() => requireSnipKey(value)).toThrow(SnipValidationError)
    },
  )

  it('validates TTL, sizes, and deploy byte limits as safe integers', () => {
    expect(requireTtlSeconds(3600)).toBe(3600)
    expect(requireByteSize(0)).toBe(0)
    expect(parseMaxObjectBytes(undefined)).toBe(DEFAULT_MAX_OBJECT_BYTES)
    expect(parseMaxObjectBytes('2048')).toBe(2048)

    expect(() => requireTtlSeconds(0)).toThrow(SnipValidationError)
    expect(() => requireTtlSeconds(1.5)).toThrow(SnipValidationError)
    expect(() => requireByteSize(-1)).toThrow(SnipValidationError)
    expect(() => parseMaxObjectBytes('invalid')).toThrow(SnipValidationError)
  })

  it('requires timestamps with an explicit timezone', () => {
    expect(requireTimestamp('createdAt', '2026-09-11T08:00:00Z')).toBe(
      '2026-09-11T08:00:00Z',
    )
    expect(requireTimestamp('expiresAt', '2026-09-11T08:00:00+08:00')).toBe(
      '2026-09-11T08:00:00+08:00',
    )

    expect(() => requireTimestamp('createdAt', '2026-09-11T08:00:00')).toThrow(
      SnipValidationError,
    )
    expect(() => requireTimestamp('createdAt', 'not-a-date')).toThrow(
      SnipValidationError,
    )
  })

  it('measures UTF-8 bytes instead of JavaScript code units', () => {
    expect(textByteSize('abc')).toBe(3)
    expect(textByteSize('传输')).toBe(6)
  })
})

describe('filename handling', () => {
  it('removes paths and control characters', () => {
    expect(sanitizeFilename('../folder\\bad\u0000name.txt')).toBe('badname.txt')
    expect(sanitizeFilename('..')).toBe('download.bin')
  })

  it('truncates on UTF-8 boundaries while preserving an extension', () => {
    const filename = sanitizeFilename(`${'传'.repeat(200)}.json`)

    expect(textByteSize(filename)).toBeLessThanOrEqual(MAX_SAFE_FILENAME_BYTES)
    expect(filename.endsWith('.json')).toBe(true)
    expect(filename).not.toContain('\ufffd')
  })

  it('encodes a non-ASCII filename exactly once', () => {
    expect(encodeFilenameHeader('传输 文档.txt')).toBe(
      '%E4%BC%A0%E8%BE%93%20%E6%96%87%E6%A1%A3.txt',
    )
    expect(encodeFilenameHeader('already%20encoded.txt')).toBe(
      'already%2520encoded.txt',
    )
  })

  it('prefers RFC 5987 filename* and sanitizes the result', () => {
    const disposition =
      "attachment; filename=old.txt; filename*=UTF-8''..%2F%E4%BC%A0%E8%BE%93.txt"

    expect(parseContentDispositionFilename(disposition)).toBe('传输.txt')
  })

  it('parses quoted semicolons and falls back from invalid filename*', () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="report; final.txt"',
      ),
    ).toBe('report; final.txt')
    expect(
      parseContentDispositionFilename(
        "attachment; filename=fallback.txt; filename*=UTF-8''%ZZ",
      ),
    ).toBe('fallback.txt')
    expect(parseContentDispositionFilename(null)).toBeNull()
  })

  it('builds a safe fallback without changing attachment semantics', () => {
    expect(fallbackDownloadFilename('object-key', 'json')).toBe(
      'object-key.json',
    )
    expect(fallbackDownloadFilename('object-key', '../svg')).toBe(
      'object-key.bin',
    )
  })
})
