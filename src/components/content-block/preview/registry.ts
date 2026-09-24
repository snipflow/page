import type { PreviewKind } from '../../../domain/preview/index.ts'
import {
  AudioPreview,
  DiffPreview,
  MarkdownPreview,
  RasterPreview,
  SourcePreview,
  TablePreview,
  type PreviewRenderer,
  VideoPreview,
} from './renderers.tsx'

const PREVIEW_RENDERERS: Partial<Record<PreviewKind, PreviewRenderer>> = {
  audio: AudioPreview,
  diff: DiffPreview,
  'plain-text': SourcePreview,
  markdown: MarkdownPreview,
  'raster-image': RasterPreview,
  table: TablePreview,
  video: VideoPreview,
}

export function getPreviewRenderer(kind: PreviewKind): PreviewRenderer | null {
  return PREVIEW_RENDERERS[kind] ?? null
}
