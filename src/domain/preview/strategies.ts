import type { ImageDimensions } from '../content-inspection/image.ts'
export type PreviewKind =
  | 'audio'
  | 'markdown'
  | 'metadata-only'
  | 'plain-text'
  | 'raster-image'
  | 'video'

export const MAX_RASTER_PIXELS = 24_000_000

export type PreviewIssue =
  | 'decode-failed'
  | 'inspection-failed'
  | 'pixel-limit'
  | 'unknown-dimensions'
  | null

export interface PreviewContext {
  blob: Blob | null
  text: string | null
  imageDimensions: ImageDimensions | null
  issue: PreviewIssue
}

export interface PreviewResolution {
  kind: PreviewKind
  issue: PreviewIssue
}

export interface PreviewRenderInput {
  blob: Blob | null
  text: string | null
}

export interface PreviewStrategy {
  kind: PreviewKind
  input: 'text' | 'blob' | 'none'
  renderable: boolean
  requiresSignature: boolean
  canRender: (input: PreviewRenderInput) => boolean
  resolve: (context: PreviewContext) => PreviewResolution
}

function resolveTextPreview(
  kind: 'plain-text' | 'markdown',
  context: PreviewContext,
): PreviewResolution {
  return context.text === null
    ? {
        kind: 'metadata-only',
        issue: context.issue ?? 'decode-failed',
      }
    : { kind, issue: context.issue }
}

const metadataOnlyStrategy: PreviewStrategy = {
  kind: 'metadata-only',
  input: 'none',
  renderable: false,
  requiresSignature: false,
  canRender: () => false,
  resolve: ({ issue }) => ({ kind: 'metadata-only', issue }),
}

const plainTextStrategy: PreviewStrategy = {
  kind: 'plain-text',
  input: 'text',
  renderable: true,
  requiresSignature: false,
  canRender: ({ text }) => text !== null,
  resolve: (context) => resolveTextPreview('plain-text', context),
}

const markdownStrategy: PreviewStrategy = {
  kind: 'markdown',
  input: 'text',
  renderable: true,
  requiresSignature: false,
  canRender: ({ text }) => text !== null,
  resolve: (context) => resolveTextPreview('markdown', context),
}

const rasterStrategy: PreviewStrategy = {
  kind: 'raster-image',
  input: 'blob',
  renderable: true,
  requiresSignature: true,
  canRender: ({ blob }) => blob !== null,
  resolve: (context) => {
    const dimensions = context.imageDimensions
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      return { kind: 'metadata-only', issue: 'unknown-dimensions' }
    }
    if (dimensions.width * dimensions.height > MAX_RASTER_PIXELS) {
      return { kind: 'metadata-only', issue: 'pixel-limit' }
    }
    return { kind: 'raster-image', issue: context.issue }
  },
}

function blobPreviewStrategy(kind: 'audio' | 'video'): PreviewStrategy {
  return {
    kind,
    input: 'blob',
    renderable: true,
    requiresSignature: true,
    canRender: ({ blob }) => blob !== null,
    resolve: ({ blob, issue }) =>
      blob
        ? { kind, issue }
        : { kind: 'metadata-only', issue: issue ?? 'inspection-failed' },
  }
}

const PREVIEW_STRATEGIES: Readonly<Record<PreviewKind, PreviewStrategy>> = {
  audio: blobPreviewStrategy('audio'),
  'metadata-only': metadataOnlyStrategy,
  'plain-text': plainTextStrategy,
  markdown: markdownStrategy,
  'raster-image': rasterStrategy,
  video: blobPreviewStrategy('video'),
}

export function getPreviewStrategy(kind: PreviewKind): PreviewStrategy {
  return PREVIEW_STRATEGIES[kind]
}

export function resolvePreview(
  kind: PreviewKind,
  context: PreviewContext,
): PreviewResolution {
  return getPreviewStrategy(kind).resolve(context)
}

export function isPreviewRenderable(kind: PreviewKind): boolean {
  return getPreviewStrategy(kind).renderable
}
