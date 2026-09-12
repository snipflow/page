import type { SnipApi } from '../api/index.ts'
import type { ReadSnipResponse } from '../domain/index.ts'
import { readReceivedSnip } from './receive-object.ts'

function makeApi(object: ReadSnipResponse): SnipApi {
  return {
    authenticate: vi.fn<SnipApi['authenticate']>(),
    create: vi.fn<SnipApi['create']>(),
    delete: vi.fn<SnipApi['delete']>(),
    health: vi.fn<SnipApi['health']>(),
    list: vi.fn<SnipApi['list']>(),
    read: vi.fn<SnipApi['read']>(async () => object),
    stats: vi.fn<SnipApi['stats']>(),
  }
}

function object(
  body: Blob,
  contentType: string,
  serverFilename: string | null = null,
): ReadSnipResponse {
  return {
    key: 'object-key',
    body,
    metadata: {
      contentType,
      contentDisposition: serverFilename
        ? `attachment; filename="${serverFilename}"`
        : null,
      contentLength: body.size,
      downloadFilename: serverFilename ?? 'object-key.bin',
      etag: null,
      issues: [],
      serverFilename,
    },
  }
}

describe('readReceivedSnip', () => {
  it('keeps unnamed decodable text copyable with an exact full value', async () => {
    const text = '  line one\n雪\nlast  '
    const result = await readReceivedSnip(
      makeApi(object(new Blob([text]), 'text/plain; charset=utf-8')),
      'object-key',
    )

    expect(result.fullText).toBe(text)
    expect(result.inspection.contentRole).toBe('inline-text')
    expect(result.inspection.previewKind).toBe('plain-text')
  })

  it('keeps an empty unnamed text object copyable', async () => {
    const result = await readReceivedSnip(
      makeApi(object(new Blob([]), 'text/plain; charset=utf-8')),
      'object-key',
    )

    expect(result.fullText).toBe('')
    expect(result.inspection.contentRole).toBe('inline-text')
    expect(result.inspection.previewKind).toBe('plain-text')
  })

  it('classifies a named text object as a downloadable attachment', async () => {
    const result = await readReceivedSnip(
      makeApi(object(new Blob(['# heading']), 'text/markdown', 'notes.md')),
      'object-key',
    )

    expect(result.inspection.fileType.id).toBe('markdown')
    expect(result.inspection.contentRole).toBe('attachment')
    expect(result.inspection.previewKind).toBe('markdown')
  })

  it('retains invalid UTF-8 as downloadable metadata instead of losing the blob', async () => {
    const body = new Blob([new Uint8Array([0xc3, 0x28])])
    const result = await readReceivedSnip(
      makeApi(object(body, 'text/plain; charset=utf-8')),
      'object-key',
    )

    expect(result.object.body).toBe(body)
    expect(result.fullText).toBeNull()
    expect(result.inspection.contentRole).toBe('attachment')
    expect(result.inspection.previewKind).toBe('metadata-only')
    expect(result.inspection.previewIssue).toBe('decode-failed')
  })

  it('retains the original Blob when content inspection itself fails', async () => {
    const body = new Blob(['unreadable'])
    const unreadableSlice = new Blob()
    vi.spyOn(unreadableSlice, 'arrayBuffer').mockRejectedValue(
      new Error('read failed'),
    )
    vi.spyOn(body, 'slice').mockReturnValue(unreadableSlice)

    const result = await readReceivedSnip(
      makeApi(object(body, 'application/octet-stream', 'payload.bin')),
      'object-key',
    )

    expect(result.object.body).toBe(body)
    expect(result.fullText).toBeNull()
    expect(result.inspection.contentRole).toBe('attachment')
    expect(result.inspection.previewKind).toBe('metadata-only')
    expect(result.inspection.previewIssue).toBe('inspection-failed')
  })
})
