import type { PreparedUpload, SendOptions } from '../domain/models.ts'
import {
  buildAuthorizationHeaders,
  buildCreateHeaders,
  parseObjectResponseMetadata,
} from './headers.ts'

const upload: PreparedUpload = {
  body: new Blob(['content']),
  contentType: 'text/plain; charset=utf-8',
  filename: null,
}

describe('request headers', () => {
  it('omits random key, permanent TTL, filename, false overwrite, and length', () => {
    const options: SendOptions = {
      key: null,
      ttlSeconds: null,
      overwrite: false,
    }
    const headers = buildCreateHeaders({
      token: 'runtime-token',
      upload,
      options,
    })

    expect(headers.get('authorization')).toBe('Bearer runtime-token')
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(headers.get('x-snip-source')).toBe('page')
    expect(headers.has('x-snip-key')).toBe(false)
    expect(headers.has('x-snip-ttl')).toBe(false)
    expect(headers.has('x-snip-filename')).toBe(false)
    expect(headers.has('x-snip-overwrite')).toBe(false)
    expect(headers.has('content-length')).toBe(false)
  })

  it('sets explicit controls and encodes the safe filename once', () => {
    const headers = buildCreateHeaders({
      token: 'runtime-token',
      upload: { ...upload, filename: '传输 文档.txt' },
      options: {
        key: 'explicit_key',
        ttlSeconds: 3600,
        overwrite: true,
      },
    })

    expect(headers.get('x-snip-key')).toBe('explicit_key')
    expect(headers.get('x-snip-ttl')).toBe('3600')
    expect(headers.get('x-snip-overwrite')).toBe('true')
    expect(headers.get('x-snip-filename')).toBe(
      '%E4%BC%A0%E8%BE%93%20%E6%96%87%E6%A1%A3.txt',
    )
  })

  it('rejects missing tokens and invalid controls before fetch', () => {
    expect(() => buildAuthorizationHeaders('')).toThrow(TypeError)
    expect(() =>
      buildCreateHeaders({
        token: 'token',
        upload,
        options: { key: 'bad/key', ttlSeconds: null, overwrite: false },
      }),
    ).toThrow('Key must contain')
    expect(() =>
      buildCreateHeaders({
        token: 'token',
        upload,
        options: { key: null, ttlSeconds: 0, overwrite: false },
      }),
    ).toThrow('TTL must be')
  })
})

describe('object response metadata', () => {
  it('keeps server and fallback filenames separate', () => {
    const unnamed = parseObjectResponseMetadata(
      'plain-object',
      new Headers({ 'content-type': 'application/json' }),
    )
    const named = parseObjectResponseMetadata(
      'image-object',
      new Headers({
        'content-type': 'image/png',
        'content-disposition':
          "attachment; filename*=UTF-8''%E4%BC%A0%E8%BE%93.png",
      }),
    )

    expect(unnamed.serverFilename).toBeNull()
    expect(unnamed.downloadFilename).toBe('plain-object.json')
    expect(named.serverFilename).toBe('传输.png')
    expect(named.downloadFilename).toBe('传输.png')
  })

  it('preserves usable bytes when response metadata is invalid', () => {
    const metadata = parseObjectResponseMetadata(
      'binary-object',
      new Headers({
        'content-type': 'not-a-mime',
        'content-length': '-3',
        etag: 'object-tag',
      }),
    )

    expect(metadata.contentType).toBe('application/octet-stream')
    expect(metadata.contentLength).toBeNull()
    expect(metadata.etag).toBe('object-tag')
    expect(metadata.issues).toEqual([
      'invalid-content-type',
      'invalid-content-length',
    ])
  })
})
