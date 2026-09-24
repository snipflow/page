import { createElement, useEffect, useState } from 'react'
import { FileQuestion } from 'lucide-react'
import {
  readBlobTextPreview,
  type FileTypeId,
  type PreviewKind,
} from '../../../domain/index.ts'
import { getPreviewStrategy } from '../../../domain/preview/index.ts'
import {
  ErrorPopover,
  FeedbackPopoverAnchor,
} from '../../feedback/ActionPopover.tsx'
import { getPreviewRenderer } from './registry.ts'

interface PreviewSurfaceProps {
  blob?: Blob | null
  contentType?: string
  fileTypeId?: FileTypeId | null
  previewKind: PreviewKind
  text?: string | null
  truncated?: boolean
}

export function PreviewSurface({
  blob = null,
  contentType = 'application/octet-stream',
  fileTypeId = null,
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
        fileTypeId,
        text: resolvedText,
        truncated: resolvedTruncated,
      })
    ) : (
      <output className="preview-surface__fallback">
        <FileQuestion aria-hidden="true" />
        <span>
          {currentTextResult?.failed ? '预览暂不可用' : '此类型仅提供文件信息'}
        </span>
        {currentTextResult?.failed ? (
          <FeedbackPopoverAnchor>
            <ErrorPopover
              message="无法读取附件中的文本，文件信息和下载功能仍可使用。"
              title="内容预览失败"
              triggerLabel="查看预览错误"
            />
          </FeedbackPopoverAnchor>
        ) : null}
      </output>
    )

  return (
    <section className="preview-surface" aria-labelledby="preview-title">
      <h3 id="preview-title">预览</h3>
      <div className="preview-surface__viewport">{content}</div>
    </section>
  )
}
