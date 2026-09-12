import {
  ArrowLeft,
  Check,
  Copy,
  FilePlus2,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react'
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { PreviewSurface } from '../../components/content-block/PreviewSurface.tsx'
import {
  createTextPreview,
  parseMaxObjectBytes,
  prepareAttachmentDraft,
  SnipValidationError,
  textByteSize,
} from '../../domain/index.ts'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { useSendStore, useSendStoreApi, type SendState } from './send-store.ts'
import { useSendFlow } from './use-send-flow.ts'

const MAX_OBJECT_BYTES = parseMaxObjectBytes(
  import.meta.env.VITE_MAX_OBJECT_BYTES,
)
const TTL_OPTIONS = [
  { label: '1 小时', value: '3600' },
  { label: '24 小时', value: '86400' },
  { label: '7 天', value: '604800' },
  { label: '永久', value: 'permanent' },
] as const

function phaseLabel(phase: SendState['phase']) {
  switch (phase) {
    case 'ready':
      return '待发送'
    case 'sending':
      return '发送中'
    case 'sent':
      return '已发送'
    case 'failed':
      return '发送失败'
    case 'conflict':
      return 'Key 冲突'
    case 'uncertain':
      return '结果未知'
    default:
      return '编辑中'
  }
}

function attachmentFailure(error: unknown) {
  if (error instanceof SnipValidationError) {
    if (error.field === 'body') return '空文件不能发送。'
    if (error.field === 'size') {
      return `文件超过当前 ${Math.round(MAX_OBJECT_BYTES / 1024 / 1024)} MiB 限制。`
    }
    if (error.field === 'filename') return '文件名无效。'
  }
  return '无法读取这个文件，请重新选择。'
}

function hasPreparedContent(state: SendState) {
  return (
    state.draft.content.kind === 'attachment' ||
    state.draft.content.text.length > 0
  )
}

export function SendPage() {
  const state = useSendStore((current) => current)
  const store = useSendStoreApi()
  const { submit } = useSendFlow()
  const [detailOpen, setDetailOpen] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [attachmentMessage, setAttachmentMessage] = useState('')
  const [isInspecting, setIsInspecting] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const blockRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importSequence = useRef(0)
  const content = state.draft.content
  const text = content.kind === 'text' ? content.text : ''
  const textPreview = useMemo(() => createTextPreview(text), [text])
  const attachment = content.kind === 'attachment' ? content : null

  const handleConfirm = (event: FormEvent) => {
    event.preventDefault()
    store.getState().confirmText()
  }

  const sendFromDetail = () => {
    if (!submit()) return
    setDetailOpen(false)
    globalThis.setTimeout(() => blockRef.current?.focus(), 0)
  }

  const copyKey = async () => {
    if (state.phase !== 'sent') return
    try {
      await copyTextToClipboard(state.result.key)
      setCopyMessage('Key 已复制')
    } catch {
      setCopyMessage('复制失败')
    }
  }

  const importAttachment = async (file: File) => {
    const current = store.getState()
    if (['sending', 'sent', 'uncertain'].includes(current.phase)) return
    if (
      hasPreparedContent(current) &&
      !window.confirm('这会替换当前草稿，确认继续吗？')
    ) {
      return
    }

    const identity = {
      draftId: current.draft.draftId,
      revision: current.draft.revision,
    }
    const sequence = ++importSequence.current
    setAttachmentMessage('')
    setIsInspecting(true)
    try {
      const prepared = await prepareAttachmentDraft(file, MAX_OBJECT_BYTES)
      if (sequence !== importSequence.current) return
      if (!store.getState().replaceWithAttachment(identity, prepared)) {
        setAttachmentMessage('草稿已发生变化，请重新选择文件。')
        return
      }
      setDetailOpen(false)
      setCopyMessage('')
    } catch (error) {
      if (sequence === importSequence.current) {
        setAttachmentMessage(attachmentFailure(error))
      }
    } finally {
      if (sequence === importSequence.current) setIsInspecting(false)
    }
  }

  const handleFiles = (files: FileList) => {
    if (files.length !== 1) {
      setAttachmentMessage('一次只能添加一个文件。')
      return
    }
    const file = files.item(0)
    if (file) void importAttachment(file)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files)
    event.target.value = ''
  }

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (event.clipboardData.files.length === 0) return
    event.preventDefault()
    handleFiles(event.clipboardData.files)
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setIsDraggingFile(false)
    handleFiles(event.dataTransfer.files)
  }

  const sendDisabled = state.phase === 'sending' || state.phase === 'uncertain'
  const canSend = state.phase === 'ready' || state.phase === 'failed'
  const fileTypeId = attachment?.inspection.fileType.id ?? 'txt'
  const blockTitle = attachment?.filename ?? '文本块'

  return (
    // File drags have the adjacent keyboard-operable file picker as their equivalent.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className={`transfer-page send-page${isDraggingFile ? 'transfer-page--file-drag' : ''}`}
      aria-labelledby="send-title"
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDraggingFile(false)
        }
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setIsDraggingFile(true)
      }}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className="transfer-page__heading">
        <h1 id="send-title">发送</h1>
      </div>

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        onChange={handleFileChange}
        aria-label="选择附件"
      />

      {state.phase === 'editing' ? (
        <form className="text-editor" onSubmit={handleConfirm}>
          <label className="sr-only" htmlFor="send-text">
            正文
          </label>
          <textarea
            id="send-text"
            value={text}
            onChange={(event) => store.getState().editText(event.target.value)}
            placeholder="正文"
          />
          <div className="draft-entry-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isInspecting}
            >
              <FilePlus2 aria-hidden="true" />
              <span>{isInspecting ? '检查中' : '选择文件'}</span>
            </button>
            <button
              className="primary-button transfer-primary"
              type="submit"
              disabled={text.length === 0 || isInspecting}
            >
              <Check aria-hidden="true" />
              <span>完成</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="prepared-content">
          <ContentBlock
            bodyRef={blockRef}
            fileTypeId={fileTypeId}
            onOpen={() => setDetailOpen(true)}
            status={phaseLabel(state.phase)}
            title={blockTitle}
            {...(canSend || state.phase === 'sending'
              ? {
                  quickAction: {
                    disabled: sendDisabled,
                    icon: <Send aria-hidden="true" />,
                    label:
                      state.phase === 'sending'
                        ? '正在发送'
                        : attachment
                          ? `发送 ${attachment.filename}`
                          : '发送文本',
                    onAction: submit,
                  },
                }
              : {})}
          />

          {state.phase === 'sent' ? (
            <div className="send-credential">
              <div>
                <span>Key</span>
                <strong>{state.result.key}</strong>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={copyKey}
                aria-label="复制 Key"
                title="复制 Key"
              >
                <Copy aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {state.phase === 'sent' ? (
            <button
              className="icon-button sent-return-button"
              type="button"
              onClick={() => {
                setDetailOpen(false)
                setCopyMessage('')
                setAttachmentMessage('')
                store.getState().startNewDraft()
              }}
              aria-label="返回并新建"
              title="返回并新建"
            >
              <ArrowLeft aria-hidden="true" />
            </button>
          ) : null}

          {state.phase === 'failed' ||
          state.phase === 'conflict' ||
          state.phase === 'uncertain' ? (
            <div className="operation-feedback" role="alert">
              <p>{state.failure.message}</p>
              {state.failure.requestId ? (
                <small>请求编号：{state.failure.requestId}</small>
              ) : null}
              <div className="inline-actions">
                {state.phase === 'conflict' ? (
                  <button
                    type="button"
                    onClick={() => {
                      store.getState().enableOverwrite()
                      submit()
                    }}
                  >
                    确认覆盖并发送
                  </button>
                ) : null}
                {state.phase === 'uncertain' ? (
                  <button
                    type="button"
                    onClick={() => store.getState().acknowledgeUncertain()}
                  >
                    我知道了，返回待发送
                  </button>
                ) : null}
                {state.phase !== 'uncertain' && !attachment ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailOpen(false)
                      setCopyMessage('')
                      store.getState().reopenEditing()
                    }}
                  >
                    <RotateCcw aria-hidden="true" />
                    返回编辑
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="clipboard-feedback" aria-live="polite">
            {copyMessage}
          </p>
        </div>
      )}

      {attachmentMessage ? (
        <div className="operation-feedback attachment-feedback" role="alert">
          <p>{attachmentMessage}</p>
        </div>
      ) : null}

      <DetailDialog
        eyebrow={attachment?.inspection.fileType.label ?? 'TXT'}
        title={
          state.phase === 'sent'
            ? state.result.key
            : (attachment?.filename ?? '文本详情')
        }
        open={detailOpen && state.phase !== 'editing'}
        onClose={() => setDetailOpen(false)}
        preview={
          (attachment?.inspection.previewKind ?? 'plain-text') !==
          'metadata-only' ? (
            <PreviewSurface
              blob={attachment?.body ?? null}
              contentType={
                attachment?.contentType ?? 'text/plain; charset=utf-8'
              }
              previewKind={attachment?.inspection.previewKind ?? 'plain-text'}
              text={attachment ? null : textPreview.text}
              truncated={attachment ? false : textPreview.truncated}
            />
          ) : null
        }
        returnFocusRef={blockRef}
      >
        {attachment?.inspection.previewKind === 'metadata-only' ? (
          <p>此类型仅提供文件信息</p>
        ) : null}
        <dl className="metadata-list">
          {attachment ? (
            <div>
              <dt>文件名</dt>
              <dd>{attachment.filename}</dd>
            </div>
          ) : null}
          <div>
            <dt>大小</dt>
            <dd>{attachment ? attachment.body.size : textByteSize(text)} B</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>{attachment?.contentType ?? 'text/plain; charset=utf-8'}</dd>
          </div>
          {attachment?.inspection.imageDimensions ? (
            <div>
              <dt>尺寸</dt>
              <dd>
                {attachment.inspection.imageDimensions.width} ×{' '}
                {attachment.inspection.imageDimensions.height}
              </dd>
            </div>
          ) : null}
        </dl>

        {state.phase !== 'sent' && state.phase !== 'sending' ? (
          <details className="send-options">
            <summary>发送选项</summary>
            <div className="send-options__fields">
              <label htmlFor="send-key">自定义 Key</label>
              <input
                id="send-key"
                value={state.draft.options.key ?? ''}
                onChange={(event) =>
                  store.getState().updateOptions({
                    key: event.target.value || null,
                    overwrite: false,
                  })
                }
                maxLength={128}
                pattern="(?:[A-Za-z0-9_]|-)+"
                placeholder="留空则自动生成"
              />
              <label htmlFor="send-ttl">有效期</label>
              <select
                id="send-ttl"
                value={
                  state.draft.options.ttlSeconds === null
                    ? 'permanent'
                    : String(state.draft.options.ttlSeconds)
                }
                onChange={(event) =>
                  store.getState().updateOptions({
                    ttlSeconds:
                      event.target.value === 'permanent'
                        ? null
                        : Number(event.target.value),
                  })
                }
              >
                {TTL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </details>
        ) : null}

        <div className="dialog-actions send-detail-actions">
          {state.phase === 'ready' || state.phase === 'failed' ? (
            <button type="button" onClick={sendFromDetail}>
              <Send aria-hidden="true" />
              发送
            </button>
          ) : null}
          {state.phase === 'ready' ||
          state.phase === 'failed' ||
          state.phase === 'conflict' ? (
            attachment ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RefreshCw aria-hidden="true" />
                  替换
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailOpen(false)
                    setAttachmentMessage('')
                    store.getState().removeAttachment()
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  移除
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FilePlus2 aria-hidden="true" />
                  替换为附件
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailOpen(false)
                    setCopyMessage('')
                    store.getState().reopenEditing()
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  重新编辑
                </button>
              </>
            )
          ) : null}
        </div>
      </DetailDialog>
    </section>
  )
}
