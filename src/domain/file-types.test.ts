import {
  FILE_TYPE_DEFINITIONS,
  deriveContentType,
  getFileTypeDefinition,
  inferExtensionFromContentType,
} from './file-types.ts'

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
