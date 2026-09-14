import type { PreviewKind } from '../../../domain/preview/index.ts'
import {
  MarkdownPreview,
  RasterPreview,
  SourcePreview,
  type PreviewRenderer,
} from './renderers.tsx'

const PREVIEW_RENDERERS: Partial<Record<PreviewKind, PreviewRenderer>> = {
  'plain-text': SourcePreview,
  markdown: MarkdownPreview,
  'raster-image': RasterPreview,
}

export function getPreviewRenderer(kind: PreviewKind): PreviewRenderer | null {
  return PREVIEW_RENDERERS[kind] ?? null
}
