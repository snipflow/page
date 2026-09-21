import {
  FILE_TYPE_DEFINITIONS,
  deriveContentType,
  findFileTypeByExtension,
  findFileTypeByMimeType,
  getFileTypeDefinition,
  inferExtensionFromContentType,
} from './index.ts'

describe('file type definitions', () => {
  it('has unique ids and known extensions', () => {
    const ids = FILE_TYPE_DEFINITIONS.map(({ id }) => id)
    const extensions = FILE_TYPE_DEFINITIONS.flatMap(
      ({ extensions: values }) => values,
    )

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(extensions).size).toBe(extensions.length)
    expect(getFileTypeDefinition('markdown').previewKind).toBe('markdown')
    expect(inferExtensionFromContentType('IMAGE/JPEG')).toBe('jpg')
  })

  it('treats unnamed decodable JSON as inline text', () => {
    const result = deriveContentType({
      contentType: 'application/json',
      utf8Decodable: true,
    })

    expect(result.fileType.id).toBe('json')
    expect(result.contentRole).toBe('inline-text')
    expect(result.previewKind).toBe('plain-text')
  })

  it('treats the same type as an attachment when a real name exists', () => {
    const result = deriveContentType({
      contentType: 'application/json',
      filename: 'settings.json',
      utf8Decodable: true,
    })

    expect(result.fileType.id).toBe('json')
    expect(result.contentRole).toBe('attachment')
  })

  it('does not use a generated fallback name as attachment evidence', () => {
    const result = deriveContentType({
      contentType: 'text/plain',
      filename: null,
      disposition: null,
      utf8Decodable: true,
    })

    expect(result.contentRole).toBe('inline-text')
  })

  it('only enables raster preview with matching signature evidence', () => {
    expect(deriveContentType({ contentType: 'image/png' }).previewKind).toBe(
      'metadata-only',
    )
    expect(
      deriveContentType({
        contentType: 'image/png',
        signatureFileType: 'png',
      }).previewKind,
    ).toBe('raster-image')
  })

  it('only enables native media previews with matching signatures', () => {
    expect(
      deriveContentType({
        contentType: 'audio/wav',
        filename: 'sample.wav',
      }).previewKind,
    ).toBe('metadata-only')
    expect(
      deriveContentType({
        contentType: 'audio/wav',
        filename: 'sample.wav',
        signatureFileType: 'wav',
      }),
    ).toMatchObject({
      contentRole: 'attachment',
      evidence: 'signature',
      previewKind: 'audio',
      fileType: { group: 'media', id: 'wav' },
    })
    expect(
      deriveContentType({
        contentType: 'video/mp4',
        filename: 'sample.mp4',
        signatureFileType: 'mp4',
      }).previewKind,
    ).toBe('video')
  })

  it.each([
    ['mp3', 'audio/mpeg', 'audio'],
    ['wav', 'audio/wav', 'audio'],
    ['ogg', 'audio/ogg', 'audio'],
    ['opus', 'audio/opus', 'audio'],
    ['flac', 'audio/flac', 'audio'],
    ['aac', 'audio/aac', 'audio'],
    ['m4a', 'audio/mp4', 'audio'],
    ['mp4', 'video/mp4', 'video'],
    ['webm', 'video/webm', 'video'],
    ['mov', 'video/quicktime', 'video'],
    ['m4v', 'video/x-m4v', 'video'],
    ['ogv', 'video/ogg', 'video'],
    ['avi', 'video/x-msvideo', 'video'],
    ['mkv', 'video/x-matroska', 'video'],
  ] as const)(
    'maps .%s and %s to a native %s preview definition',
    (extension, mimeType, previewKind) => {
      expect(findFileTypeByExtension(extension)).toMatchObject({
        group: 'media',
        previewKind,
      })
      expect(findFileTypeByMimeType(mimeType)).toMatchObject({
        group: 'media',
        previewKind,
      })
    },
  )

  it('allows a verified codec inside a compatible media container MIME', () => {
    const result = deriveContentType({
      contentType: 'audio/ogg; codecs=opus',
      filename: 'voice.opus',
      signatureFileType: 'opus',
    })

    expect(result.conflicts).toEqual(['ogg'])
    expect(result.fileType.id).toBe('opus')
    expect(result.previewKind).toBe('audio')
  })

  it('rejects native preview when verified media conflicts across renderers', () => {
    const result = deriveContentType({
      contentType: 'audio/wav',
      filename: 'claim.wav',
      signatureFileType: 'mp4',
    })

    expect(result.fileType.id).toBe('mp4')
    expect(result.conflicts).toEqual(['wav'])
    expect(result.previewKind).toBe('metadata-only')
  })

  it('keeps a reliable signature but reports conflicting metadata', () => {
    const result = deriveContentType({
      contentType: 'image/jpeg',
      filename: 'wrong.zip',
      signatureFileType: 'png',
    })

    expect(result.fileType.id).toBe('png')
    expect(result.conflicts).toEqual(['jpeg', 'zip'])
    expect(result.previewKind).toBe('metadata-only')
  })

  it('downgrades conflicting MIME and extension without a signature', () => {
    const result = deriveContentType({
      contentType: 'application/json',
      filename: 'archive.zip',
    })

    expect(result.fileType.id).toBe('unknown')
    expect(result.evidence).toBe('unknown')
    expect(result.contentRole).toBe('attachment')
  })

  it('never marks HTML or SVG as executable preview content', () => {
    expect(
      deriveContentType({
        contentType: 'text/html',
        utf8Decodable: true,
      }).previewKind,
    ).toBe('plain-text')
    expect(
      deriveContentType({
        contentType: 'image/svg+xml',
        filename: 'image.svg',
        utf8Decodable: true,
      }).previewKind,
    ).toBe('plain-text')
  })

  it('uses unknown for unrecognized imported extensions', () => {
    expect(
      deriveContentType({ filename: 'payload.custom-ext' }).fileType.id,
    ).toBe('unknown')
    expect(
      deriveContentType({
        contentType: 'application/octet-stream',
      }).fileType.id,
    ).toBe('unknown')
    expect(
      deriveContentType({
        contentType: 'application/octet-stream',
      }).contentRole,
    ).toBe('attachment')
  })
})
