import { prepareDraftUpload } from './models.ts'

describe('draft upload preparation', () => {
  it('encodes text as exact UTF-8 bytes without a filename', async () => {
    const upload = prepareDraftUpload({
      kind: 'text',
      text: ' first line\n第二行  ',
    })

    expect(upload.contentType).toBe('text/plain; charset=utf-8')
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
    })

    expect(upload.body).toBe(body)
    expect(upload.filename).toBe('payload.bin')
  })
})
