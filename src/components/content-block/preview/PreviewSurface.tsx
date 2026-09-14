import { createElement, useEffect, useState } from 'react'
import { FileQuestion } from 'lucide-react'
import { readBlobTextPreview, type PreviewKind } from '../../../domain/index.ts'
import { getPreviewStrategy } from '../../../domain/preview/index.ts'
import { getPreviewRenderer } from './registry.ts'

interface PreviewSurfaceProps {
  blob?: Blob | null
  contentType?: string
  previewKind: PreviewKind
  text?: string | null
  truncated?: boolean
}

export function PreviewSurface({
  blob = null,
  contentType = 'application/octet-stream',
  previewKind,
  text = null,
  truncated = false,
}: PreviewSurfaceProps) {
  const [textResult, setTextResult] = useState<{
    blob: Blob
    contentType: string
    failed: boolean
    text: string
    truncated: boolean
  } | null>(null)
  const strategy = getPreviewStrategy(previewKind)

  useEffect(() => {
    if (text !== null || !blob || strategy.input !== 'text') {
      return
    }
    let current = true
    void readBlobTextPreview(blob, contentType)
      .then((result) => {
        if (current) {
          setTextResult({ blob, contentType, failed: false, ...result })
        }
      })
      .catch(() => {
        if (current) {
          setTextResult({
            blob,
            contentType,
            failed: true,
            text: '',
            truncated: false,
          })
        }
      })
    return () => {
      current = false
    }
  }, [blob, contentType, strategy.input, text])

  const currentTextResult =
    textResult?.blob === blob && textResult.contentType === contentType
      ? textResult
      : null
  const resolvedText =
    text ??
    (currentTextResult && !currentTextResult.failed
      ? currentTextResult.text
      : null)
  const resolvedTruncated =
    text === null ? (currentTextResult?.truncated ?? false) : truncated
  const renderer = getPreviewRenderer(previewKind)
  const canRender = strategy.canRender({ blob, text: resolvedText })
  const content =
    renderer && canRender ? (
      createElement(renderer, {
        blob,
        contentType,
        text: resolvedText,
        truncated: resolvedTruncated,
      })
    ) : (
      <output className="preview-surface__fallback">
        <FileQuestion aria-hidden="true" />
        <span>
          {currentTextResult?.failed ? '内容预览失败' : '此类型仅提供文件信息'}
        </span>
      </output>
    )

  return (
    <section className="preview-surface" aria-labelledby="preview-title">
      <h3 id="preview-title">预览</h3>
      <div className="preview-surface__viewport">{content}</div>
    </section>
  )
}
