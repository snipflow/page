import { deriveContentType } from './file-types/index.ts'
import { prepareDraftUpload } from './models.ts'

describe('draft upload preparation', () => {
  it('encodes text as exact UTF-8 bytes without a filename', async () => {
    const upload = prepareDraftUpload({
      kind: 'text',
      text: ' first line\n第二行  ',
    })

    expect(upload.contentType).toBe('text/plain')
    expect(upload.charset).toBe('utf-8')
    expect(upload.filename).toBeNull()
    expect(await upload.body.text()).toBe(' first line\n第二行  ')
  })

  it('keeps an attachment Blob as the single byte authority', () => {
    const body = new Blob([new Uint8Array([0, 255, 16])])
    const upload = prepareDraftUpload({
      kind: 'attachment',
      body,
      contentType: 'application/octet-stream',
      filename: 'payload.bin',
      inspection: {
        ...deriveContentType({
          contentType: 'application/octet-stream',
          filename: 'payload.bin',
          disposition: 'attachment',
        }),
        imageDimensions: null,
        previewIssue: null,
      },
      previewVersion: 0,
      sourceText: null,
    })

    expect(upload.body).toBe(body)
    expect(upload.charset).toBeNull()
    expect(upload.filename).toBe('payload.bin')
  })

  it('declares UTF-8 separately for text-generated attachments', () => {
    const body = new Blob(['{"enabled":true}'], { type: 'application/json' })
    const contentType = 'application/json'
    const upload = prepareDraftUpload({
      kind: 'attachment',
      body,
      contentType,
      filename: 'settings.json',
      inspection: {
        ...deriveContentType({
          contentType,
          filename: 'settings.json',
          disposition: 'attachment',
        }),
        imageDimensions: null,
        previewIssue: null,
      },
      previewVersion: 1,
      sourceText: '{"enabled":true}',
    })

    expect(upload.contentType).toBe('application/json')
    expect(upload.charset).toBe('utf-8')
  })
})
