import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import parseDiff from 'parse-diff'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import {
  Code2,
  Eye,
  FileAudio,
  FileDiff,
  FileVideo,
  ImageOff,
} from 'lucide-react'
import { useObjectUrl } from '../../../features/transfer/use-object-url.ts'
import {
  ErrorPopover,
  FeedbackPopoverAnchor,
} from '../../feedback/ActionPopover.tsx'

const MAX_MARKDOWN_NODES = 10_000
const MAX_MARKDOWN_DEPTH = 32
const MAX_DIFF_FILES = 200
const MAX_DIFF_LINES = 10_000

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

function MediaPreview({
  blob,
  kind,
}: PreviewRendererProps & { kind: 'audio' | 'video' }) {
  const url = useObjectUrl(blob as Blob)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const failed = url !== null && failedUrl === url
  const isAudio = kind === 'audio'
  const label = isAudio ? '音频' : '视频'
  const FallbackIcon = isAudio ? FileAudio : FileVideo

  if (!blob) return null
  if (failed) {
    return (
      <output className="preview-surface__fallback">
        <FallbackIcon aria-hidden="true" />
        <span>预览暂不可用</span>
        <FeedbackPopoverAnchor>
          <ErrorPopover
            message={`浏览器无法解码这个${label}，文件信息和下载功能仍可使用。`}
            title={`${label}预览失败`}
            triggerLabel="查看预览错误"
          />
        </FeedbackPopoverAnchor>
      </output>
    )
  }
  if (!url) {
    return (
      <output className="preview-surface__fallback">
        <span className="activity-indicator" aria-hidden="true" />
        <span>正在准备预览</span>
      </output>
    )
  }

  return (
    <div className={`preview-surface__media preview-surface__media--${kind}`}>
      {isAudio ? (
        // The attachment protocol carries one file and has no caption sidecar.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          aria-label="音频预览"
          controls
          preload="metadata"
          src={url}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        // The attachment protocol carries one file and has no caption sidecar.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          aria-label="视频预览"
          controls
          playsInline
          preload="metadata"
          src={url}
          onError={() => setFailedUrl(url)}
        />
      )}
    </div>
  )
}

export function AudioPreview(props: PreviewRendererProps) {
  return <MediaPreview {...props} kind="audio" />
}

export function VideoPreview(props: PreviewRendererProps) {
  return <MediaPreview {...props} kind="video" />
}

type DiffFile = ReturnType<typeof parseDiff>[number]
type DiffChange = DiffFile['chunks'][number]['changes'][number]

function inspectDiff(source: string) {
  try {
    const files = parseDiff(source)
    const lineCount = files.reduce(
      (total, file) =>
        total +
        file.chunks.reduce(
          (fileTotal, chunk) => fileTotal + chunk.changes.length,
          0,
        ),
      0,
    )
    return {
      files,
      renderable: files.length > 0 && lineCount > 0,
      withinBudget:
        files.length <= MAX_DIFF_FILES && lineCount <= MAX_DIFF_LINES,
    }
  } catch {
    return { files: [] as DiffFile[], renderable: false, withinBudget: true }
  }
}

function diffPath(file: DiffFile, index: number) {
  const candidate =
    (file.to && file.to !== '/dev/null' ? file.to : null) ??
    (file.from && file.from !== '/dev/null' ? file.from : null)
  return candidate?.replace(/^[ab]\//, '') ?? `文件 ${index + 1}`
}

function diffLineNumbers(change: DiffChange) {
  if (change.type === 'add') return { next: change.ln, previous: null }
  if (change.type === 'del') return { next: null, previous: change.ln }
  return { next: change.ln2, previous: change.ln1 }
}

export function DiffPreview({ text, truncated }: PreviewRendererProps) {
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const result = useMemo(
    () => (text === null ? null : inspectDiff(text)),
    [text],
  )
  const canRender = Boolean(result?.renderable && result.withinBudget)
  const effectiveMode = canRender ? mode : 'source'

  if (text === null) return null
  return (
    <div className="preview-surface__diff">
      <div className="preview-mode" aria-label="补丁预览模式">
        <button
          type="button"
          aria-pressed={effectiveMode === 'rendered'}
          disabled={!canRender}
          onClick={() => setMode('rendered')}
        >
          <FileDiff aria-hidden="true" />
          差异
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
      {!canRender ? (
        <output className="preview-surface__notice">
          {result?.withinBudget
            ? '未识别到标准文本差异，已显示源码'
            : '补丁结构超出安全预览限制，已显示源码'}
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
        <div className="diff-preview">
          {result!.files.map((file, fileIndex) => {
            const path = diffPath(file, fileIndex)
            return (
              <section
                key={`${file.from ?? ''}:${file.to ?? ''}:${fileIndex}`}
                className="diff-preview__file"
                aria-label={path}
              >
                <header className="diff-preview__file-header">
                  <FileDiff aria-hidden="true" />
                  <h4>{path}</h4>
                  <small>
                    +{file.additions} -{file.deletions}
                  </small>
                </header>
                {file.chunks.map((chunk, chunkIndex) => (
                  <div
                    key={`${chunk.content}:${chunkIndex}`}
                    className="diff-preview__chunk"
                  >
                    <h5>{chunk.content}</h5>
                    <div className="diff-preview__lines">
                      {chunk.changes.map((change, changeIndex) => {
                        const numbers = diffLineNumbers(change)
                        return (
                          <div
                            key={`${change.type}:${changeIndex}`}
                            className="diff-preview__line"
                            data-line-kind={change.type}
                          >
                            <span aria-hidden="true">
                              {numbers.previous ?? ''}
                            </span>
                            <span aria-hidden="true">{numbers.next ?? ''}</span>
                            <code>{change.content}</code>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
          {truncated ? (
            <p className="preview-surface__notice">仅解析前 256 KiB</p>
          ) : null}
        </div>
      )}
    </div>
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
