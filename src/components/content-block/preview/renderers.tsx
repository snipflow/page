import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { Code2, Eye, ImageOff } from 'lucide-react'
import { useObjectUrl } from '../../../features/transfer/use-object-url.ts'
import {
  ErrorPopover,
  FeedbackPopoverAnchor,
} from '../../feedback/ActionPopover.tsx'

const MAX_MARKDOWN_NODES = 10_000
const MAX_MARKDOWN_DEPTH = 32

interface MarkdownNode {
  children?: MarkdownNode[]
}

export interface PreviewRendererProps {
  blob: Blob | null
  contentType: string
  text: string | null
  truncated: boolean
}

export type PreviewRenderer = ComponentType<PreviewRendererProps>

function markdownWithinBudget(source: string) {
  try {
    const tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .parse(source) as MarkdownNode
    const pending = [{ depth: 0, node: tree }]
    let nodes = 0
    while (pending.length) {
      const current = pending.pop()!
      nodes += 1
      if (nodes > MAX_MARKDOWN_NODES || current.depth > MAX_MARKDOWN_DEPTH) {
        return false
      }
      for (const child of current.node.children ?? []) {
        pending.push({ depth: current.depth + 1, node: child })
      }
    }
    return true
  } catch {
    return false
  }
}

export function SourcePreview({ text, truncated }: PreviewRendererProps) {
  if (text === null) return null
  return (
    <div className="preview-surface__source">
      <pre>{text}</pre>
      {truncated ? (
        <p className="preview-surface__notice">仅显示前 256 KiB</p>
      ) : null}
    </div>
  )
}

export function RasterPreview({ blob }: PreviewRendererProps) {
  const url = useObjectUrl(blob as Blob)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const failed = url !== null && failedUrl === url
  if (!blob) return null
  if (failed) {
    return (
      <output className="preview-surface__fallback">
        <ImageOff aria-hidden="true" />
        <span>预览暂不可用</span>
        <FeedbackPopoverAnchor>
          <ErrorPopover
            message="浏览器无法解码这张图片，文件信息和下载功能仍可使用。"
            title="图片预览失败"
            triggerLabel="查看预览错误"
          />
        </FeedbackPopoverAnchor>
      </output>
    )
  }
  return url ? (
    <div className="preview-surface__image">
      <img src={url} alt="附件预览" onError={() => setFailedUrl(url)} />
    </div>
  ) : (
    <output className="preview-surface__fallback">
      <span className="activity-indicator" aria-hidden="true" />
      <span>正在准备预览</span>
    </output>
  )
}

export function MarkdownPreview({ text, truncated }: PreviewRendererProps) {
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const withinBudget = useMemo(
    () => (text === null ? false : markdownWithinBudget(text)),
    [text],
  )
  const effectiveMode = withinBudget ? mode : 'source'

  if (text === null) return null
  return (
    <div className="preview-surface__markdown">
      <div className="preview-mode" aria-label="Markdown 预览模式">
        <button
          type="button"
          aria-pressed={effectiveMode === 'rendered'}
          disabled={!withinBudget}
          onClick={() => setMode('rendered')}
        >
          <Eye aria-hidden="true" />
          渲染
        </button>
        <button
          type="button"
          aria-pressed={effectiveMode === 'source'}
          onClick={() => setMode('source')}
        >
          <Code2 aria-hidden="true" />
          源码
        </button>
      </div>
      {!withinBudget ? (
        <output className="preview-surface__notice">
          文档结构超出安全预览限制，已切换到源码
        </output>
      ) : null}
      {effectiveMode === 'source' ? (
        <SourcePreview
          blob={null}
          contentType="text/plain"
          text={text}
          truncated={truncated}
        />
      ) : (
        <div className="markdown-preview">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
              a: ({ children }) => (
                <span className="markdown-preview__link">{children}</span>
              ),
              img: ({ alt }) => (
                <span className="markdown-preview__blocked-media">
                  {alt || '远程图片'}
                </span>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
          {truncated ? (
            <p className="preview-surface__notice">仅渲染前 256 KiB</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
