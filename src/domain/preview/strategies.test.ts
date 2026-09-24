import {
  getPreviewStrategy,
  isPreviewRenderable,
  MAX_RASTER_PIXELS,
  resolvePreview,
} from './strategies.ts'

describe('preview strategies', () => {
  it('describes text and metadata preview capabilities', () => {
    expect(getPreviewStrategy('diff').input).toBe('text')
    expect(getPreviewStrategy('diff').requiresSignature).toBe(false)
    expect(getPreviewStrategy('markdown').input).toBe('text')
    expect(getPreviewStrategy('markdown').requiresSignature).toBe(false)
    expect(isPreviewRenderable('plain-text')).toBe(true)
    expect(getPreviewStrategy('table').input).toBe('text')
    expect(isPreviewRenderable('table')).toBe(true)
    expect(isPreviewRenderable('metadata-only')).toBe(false)
  })

  it('requires verified blobs for native media previews', () => {
    expect(getPreviewStrategy('audio')).toMatchObject({
      input: 'blob',
      renderable: true,
      requiresSignature: true,
    })
    expect(getPreviewStrategy('video')).toMatchObject({
      input: 'blob',
      renderable: true,
      requiresSignature: true,
    })
    expect(
      resolvePreview('audio', {
        blob: null,
        text: null,
        imageDimensions: null,
        issue: null,
      }),
    ).toEqual({ kind: 'metadata-only', issue: 'inspection-failed' })
  })

  it('downgrades unavailable text content to metadata', () => {
    expect(
      resolvePreview('plain-text', {
        blob: null,
        text: null,
        imageDimensions: null,
        issue: 'decode-failed',
      }),
    ).toEqual({
      kind: 'metadata-only',
      issue: 'decode-failed',
    })
    expect(
      resolvePreview('diff', {
        blob: null,
        text: null,
        imageDimensions: null,
        issue: 'decode-failed',
      }),
    ).toEqual({
      kind: 'metadata-only',
      issue: 'decode-failed',
    })
  })

  it('centralizes raster dimension and pixel-limit decisions', () => {
    expect(
      resolvePreview('raster-image', {
        blob: new Blob(),
        text: null,
        imageDimensions: { width: 1, height: 1 },
        issue: null,
      }),
    ).toEqual({ kind: 'raster-image', issue: null })

    expect(
      resolvePreview('raster-image', {
        blob: new Blob(),
        text: null,
        imageDimensions: { width: MAX_RASTER_PIXELS + 1, height: 1 },
        issue: null,
      }),
    ).toEqual({ kind: 'metadata-only', issue: 'pixel-limit' })
  })
})
