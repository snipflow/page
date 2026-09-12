import {
  createTextPreview,
  inspectBlob,
  MAX_RASTER_PIXELS,
  MAX_TEXT_PREVIEW_BYTES,
  prepareAttachmentDraft,
  SnipValidationError,
} from './index.ts'

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('content inspection', () => {
  it('requires a matching raster signature and a known safe pixel count', async () => {
    const accepted = await inspectBlob({
      blob: new Blob([pngHeader(800, 600)]),
      contentType: 'image/png',
      filename: 'photo.png',
      disposition: 'attachment',
    })
    expect(accepted.inspection).toMatchObject({
      contentRole: 'attachment',
      previewKind: 'raster-image',
      imageDimensions: { height: 600, width: 800 },
    })

    const oversized = await inspectBlob({
      blob: new Blob([pngHeader(MAX_RASTER_PIXELS + 1, 1)]),
      contentType: 'image/png',
      filename: 'wide.png',
      disposition: 'attachment',
    })
    expect(oversized.inspection.previewKind).toBe('metadata-only')
    expect(oversized.inspection.previewIssue).toBe('pixel-limit')
  })

  it('downgrades conflicting image metadata instead of trusting its filename', async () => {
    const result = await inspectBlob({
      blob: new Blob([pngHeader(1, 1)]),
      contentType: 'image/jpeg',
      filename: 'claimed.jpg',
      disposition: 'attachment',
    })

    expect(result.inspection.fileType.id).toBe('png')
    expect(result.inspection.conflicts).toContain('jpeg')
    expect(result.inspection.previewKind).toBe('metadata-only')
  })

  it('keeps HTML and SVG in source-only preview classifications', async () => {
    for (const sample of [
      {
        contentType: 'text/html',
        filename: 'page.html',
        text: '<script>x()</script>',
      },
      {
        contentType: 'image/svg+xml',
        filename: 'shape.svg',
        text: '<svg><script>x()</script></svg>',
      },
    ]) {
      const result = await inspectBlob({
        blob: new Blob([sample.text]),
        contentType: sample.contentType,
        filename: sample.filename,
        disposition: 'attachment',
      })
      expect(result.inspection.previewKind).toBe('plain-text')
      expect(result.previewText).toBe(sample.text)
    }
  })

  it('truncates previews on a complete UTF-8 boundary without changing the source', () => {
    const source = `${'a'.repeat(MAX_TEXT_PREVIEW_BYTES - 1)}雪`
    const preview = createTextPreview(source)

    expect(preview.truncated).toBe(true)
    expect(preview.text).toBe('a'.repeat(MAX_TEXT_PREVIEW_BYTES - 1))
    expect(source.endsWith('雪')).toBe(true)
  })

  it('preserves the selected File as byte authority after local validation', async () => {
    const file = new File(['# title\n'], '../notes.md', {
      type: 'text/markdown;charset=utf-8',
    })
    const prepared = await prepareAttachmentDraft(file, 1024)

    expect(prepared.body).toBe(file)
    expect(prepared.filename).toBe('notes.md')
    expect(prepared.contentType).toBe('text/markdown;charset=utf-8')
    expect(prepared.inspection.fileType.id).toBe('markdown')
    expect(prepared.inspection.contentRole).toBe('attachment')
  })

  it('normalizes Windows ZIP MIME without rewriting bytes', async () => {
    const file = new File([new Uint8Array([80, 75, 5, 6])], 'archive.zip', {
      type: 'application/x-zip-compressed',
    })
    const prepared = await prepareAttachmentDraft(file, 1024)
    expect(prepared.body).toBe(file)
    expect(prepared.contentType).toBe('application/zip')
    expect(prepared.inspection.fileType.id).toBe('zip')
  })

  it('resolves textual .ts video MIME but preserves binary streams', async () => {
    const source = new File(['const value: number = 1'], 'source.ts', {
      type: 'video/vnd.dlna.mpeg-tts',
    })
    const prepared = await prepareAttachmentDraft(source, 1024)
    expect(prepared.body).toBe(source)
    expect(prepared.contentType).toBe('text/typescript; charset=utf-8')
    expect(prepared.inspection.previewKind).toBe('plain-text')
    const binary = new File([new Uint8Array([0, 255, 71])], 'movie.ts', {
      type: 'video/vnd.dlna.mpeg-tts',
    })
    const stream = await prepareAttachmentDraft(binary, 1024)
    expect(stream.contentType).toBe(binary.type)
    expect(stream.inspection.fileType.id).toBe('unknown')
    expect(stream.inspection.previewKind).toBe('metadata-only')
  })

  it.each([
    { file: new File([], 'empty.bin'), field: 'body', limit: 10 },
    { file: new File(['too large'], 'large.bin'), field: 'size', limit: 2 },
  ])(
    'rejects $field before a draft block is formed',
    async ({ file, field, limit }) => {
      const promise = prepareAttachmentDraft(file, limit)
      await expect(promise).rejects.toBeInstanceOf(SnipValidationError)
      await expect(promise).rejects.toMatchObject({ field })
    },
  )
})
