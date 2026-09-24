import {
  createTextPreview,
  inspectBlob,
  MAX_RASTER_PIXELS,
  MAX_TEXT_PREVIEW_BYTES,
  prepareAttachmentDraft,
  SnipValidationError,
} from '../index.ts'

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function wavHeader() {
  const bytes = new Uint8Array(44)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  view.setUint32(4, 36, true)
  bytes.set(new TextEncoder().encode('WAVEfmt '), 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8_000, true)
  view.setUint32(28, 16_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set(new TextEncoder().encode('data'), 36)
  return bytes
}

function mp4Header() {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x00, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
  ])
}

describe('content inspection', () => {
  it.each([
    ['main.py', 'python'],
    ['main.go', 'go'],
    ['main.rs', 'rust'],
    ['Main.java', 'java'],
    ['main.c', 'c'],
    ['main.hpp', 'cpp'],
    ['Main.cs', 'csharp'],
    ['index.php', 'php'],
    ['main.rb', 'ruby'],
    ['main.swift', 'swift'],
    ['main.kt', 'kotlin'],
    ['main.scala', 'scala'],
    ['main.dart', 'dart'],
    ['run.sh', 'shell'],
    ['run.ps1', 'powershell'],
    ['run.bat', 'batch'],
    ['query.sql', 'sql'],
    ['main.lua', 'lua'],
    ['analysis.R', 'r'],
    ['App.vue', 'vue'],
    ['App.svelte', 'svelte'],
    ['main.scss', 'scss'],
    ['main.sass', 'sass'],
    ['main.less', 'less'],
    ['settings.toml', 'toml'],
    ['settings.ini', 'ini'],
    ['query.gql', 'graphql'],
    ['message.proto', 'protobuf'],
    ['App.jsx', 'javascript'],
    ['main.mts', 'typescript'],
  ])(
    'previews %s as source with generic browser MIME',
    async (filename, id) => {
      const source = '  // UTF-8 源码\n<script>alert(1)</script>\n'
      for (const contentType of ['text/plain', 'application/octet-stream']) {
        const result = await inspectBlob({
          blob: new Blob([source]),
          contentType,
          filename,
        })
        expect(result.inspection).toMatchObject({
          fileType: { id, group: 'code' },
          previewKind: 'plain-text',
          contentRole: 'attachment',
        })
        expect(result.previewText).toBe(source)
        expect(result.fullText).toBe(source)
      }
    },
  )

  it('does not preview invalid UTF-8 disguised as Python source', async () => {
    const result = await inspectBlob({
      blob: new Blob([new Uint8Array([0xff, 0xfe, 0x61])]),
      contentType: 'application/octet-stream',
      filename: 'main.py',
    })
    expect(result.inspection.previewKind).toBe('metadata-only')
    expect(result.previewText).toBeNull()
  })

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

  it('recognizes a named patch even when the browser reports text/plain', async () => {
    const source = [
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -1 +1 @@',
      '-old value',
      '+new value',
      '',
    ].join('\n')
    const result = await inspectBlob({
      blob: new Blob([source], { type: 'text/plain' }),
      contentType: 'text/plain',
      filename: 'change.patch',
      disposition: 'attachment',
    })

    expect(result.fullText).toBe(source)
    expect(result.inspection).toMatchObject({
      contentRole: 'attachment',
      fileType: { group: 'code', id: 'patch' },
      previewKind: 'diff',
    })
  })

  it('does not trust a patch extension when text/plain bytes are not UTF-8', async () => {
    const result = await inspectBlob({
      blob: new Blob([new Uint8Array([0xff, 0xfe, 0x00])], {
        type: 'text/plain',
      }),
      contentType: 'text/plain',
      filename: 'claim.patch',
      disposition: 'attachment',
    })

    expect(result.fullText).toBeNull()
    expect(result.inspection).toMatchObject({
      fileType: { id: 'unknown' },
      previewIssue: 'decode-failed',
      previewKind: 'metadata-only',
    })
  })

  it.each([
    {
      bytes: wavHeader(),
      contentType: 'audio/wav',
      filename: 'sample.wav',
      fileTypeId: 'wav',
      previewKind: 'audio',
    },
    {
      bytes: mp4Header(),
      contentType: 'video/mp4',
      filename: 'sample.mp4',
      fileTypeId: 'mp4',
      previewKind: 'video',
    },
  ])(
    'enables a verified $previewKind preview for $filename',
    async ({ bytes, contentType, filename, fileTypeId, previewKind }) => {
      const result = await inspectBlob({
        blob: new Blob([bytes], { type: contentType }),
        contentType,
        filename,
        disposition: 'attachment',
      })

      expect(result.inspection).toMatchObject({
        contentRole: 'attachment',
        fileType: { group: 'media', id: fileTypeId },
        previewKind,
      })
    },
  )

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

  it('infers a registered MIME for decodable source with a generic browser MIME', async () => {
    const file = new File(['print("hello")\n'], 'hello.py', {
      type: 'application/octet-stream',
    })
    const prepared = await prepareAttachmentDraft(file, 1024)

    expect(prepared.body).toBe(file)
    expect(prepared.contentType).toBe('text/x-python')
    expect(prepared.inspection.fileType.id).toBe('python')
    expect(prepared.inspection.previewKind).toBe('plain-text')
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

  it('uses the patch extension to refine a missing or generic MIME', async () => {
    const patch = [
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n')
    const missing = await prepareAttachmentDraft(
      new File([patch], 'change.patch'),
      1024,
    )
    const generic = await prepareAttachmentDraft(
      new File([patch], 'change.diff', { type: 'application/octet-stream' }),
      1024,
    )
    const explicit = await prepareAttachmentDraft(
      new File([patch], 'change.patch', { type: 'text/plain' }),
      1024,
    )

    expect(missing.contentType).toBe('text/x-patch')
    expect(generic.contentType).toBe('text/x-diff')
    expect(explicit.contentType).toBe('text/plain')
  })

  it('keeps a generic MIME for undecodable patch bytes', async () => {
    const prepared = await prepareAttachmentDraft(
      new File([new Uint8Array([0xff, 0xfe, 0x00])], 'claim.patch', {
        type: 'application/octet-stream',
      }),
      1024,
    )

    expect(prepared.contentType).toBe('application/octet-stream')
    expect(prepared.inspection.fileType.id).toBe('patch')
    expect(prepared.inspection.previewKind).toBe('metadata-only')
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
