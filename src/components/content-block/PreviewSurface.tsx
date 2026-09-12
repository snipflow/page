import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { Code2, Eye, FileQuestion, ImageOff } from 'lucide-react'
import { readBlobTextPreview, type PreviewKind } from '../../domain/index.ts'
import { useObjectUrl } from '../../features/transfer/use-object-url.ts'

const MAX_MARKDOWN_NODES = 10_000
const MAX_MARKDOWN_DEPTH = 32

interface MarkdownNode {
  children?: MarkdownNode[]
}

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

interface PreviewSurfaceProps {
  blob?: Blob | null
  contentType?: string
  previewKind: PreviewKind
  text?: string | null
  truncated?: boolean
}

function SourcePreview({
  text,
  truncated,
}: {
  text: string
  truncated: boolean
}) {
  return (
    <div className="preview-surface__source">
      <pre>{text}</pre>
      {truncated ? (
        <p className="preview-surface__notice">仅显示前 256 KiB</p>
      ) : null}
    </div>
  )
}

function RasterPreview({ blob }: { blob: Blob }) {
  const [failed, setFailed] = useState(false)
  const url = useObjectUrl(blob)
  if (failed) {
    return (
      <output className="preview-surface__fallback">
        <ImageOff aria-hidden="true" />
        <span>图片预览失败</span>
      </output>
    )
  }
  return url ? (
    <div className="preview-surface__image">
      <img src={url} alt="附件预览" onError={() => setFailed(true)} />
    </div>
  ) : (
    <output className="preview-surface__fallback">
      <span className="activity-indicator" aria-hidden="true" />
      <span>正在准备预览</span>
    </output>
  )
}

function MarkdownPreview({
  text,
  truncated,
}: {
  text: string
  truncated: boolean
}) {
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const withinBudget = useMemo(() => markdownWithinBudget(text), [text])
  const effectiveMode = withinBudget ? mode : 'source'

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
        <SourcePreview text={text} truncated={truncated} />
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

  useEffect(() => {
    if (
      text !== null ||
      !blob ||
      (previewKind !== 'plain-text' && previewKind !== 'markdown')
    ) {
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
  }, [blob, contentType, previewKind, text])

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
  let content
  if (previewKind === 'raster-image' && blob) {
    content = <RasterPreview blob={blob} />
  } else if (previewKind === 'markdown' && resolvedText !== null) {
    content = (
      <MarkdownPreview text={resolvedText} truncated={resolvedTruncated} />
    )
  } else if (previewKind === 'plain-text' && resolvedText !== null) {
    content = (
      <SourcePreview text={resolvedText} truncated={resolvedTruncated} />
    )
  } else {
    content = (
      <output className="preview-surface__fallback">
        <FileQuestion aria-hidden="true" />
        <span>
          {currentTextResult?.failed ? '内容预览失败' : '此类型仅提供文件信息'}
        </span>
      </output>
    )
  }

  return (
    <section className="preview-surface" aria-labelledby="preview-title">
      <h3 id="preview-title">预览</h3>
      <div className="preview-surface__viewport">{content}</div>
    </section>
  )
}
