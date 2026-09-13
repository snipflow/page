import {
  ArrowLeft,
  Check,
  Copy,
  FileInput,
  FileOutput,
  FilePlus2,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { PreviewSurface } from '../../components/content-block/PreviewSurface.tsx'
import {
  createTextPreview,
  getFileTypeDefinition,
  inspectBlob,
  parseMaxObjectBytes,
  textByteSize,
  type AttachmentDraftContent,
  type ContentInspection,
  type RawCandidate,
} from '../../domain/index.ts'
import { useAuthSnapshot } from '../auth/auth-context.ts'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { runRawTask } from '../../workers/raw-task-client.ts'
import type {
  RawTaskIdentity,
  RawTaskRequest,
} from '../../workers/raw-task-types.ts'
import { TextToAttachmentEditor } from './TextToAttachmentEditor.tsx'
import {
  isMutableSendState,
  useSendStore,
  useSendStoreApi,
  type SendState,
} from './send-store.ts'
import { useAttachmentImport } from './use-attachment-import.ts'
import { useSendFlow } from './use-send-flow.ts'

const MAX_OBJECT_BYTES = parseMaxObjectBytes(
  import.meta.env.VITE_MAX_OBJECT_BYTES,
)
const RAW_DETECTION_DELAY_MS = 600

interface RawRecommendation extends RawTaskIdentity {
  candidate: RawCandidate
}

const TTL_OPTIONS = [
  { label: '1 小时', value: '3600' },
  { label: '24 小时', value: '86400' },
  { label: '7 天', value: '604800' },
  { label: '永久', value: 'permanent' },
] as const

function phaseLabel(phase: SendState['phase']) {
  switch (phase) {
    case 'preparing':
      return '准备中'
    case 'converting':
      return '转换中'
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

function selectedInspection(
  inspection: ContentInspection,
  fileTypeId: AttachmentDraftContent['inspection']['fileType']['id'],
): ContentInspection {
  if (fileTypeId !== 'custom') return inspection
  const fileType = getFileTypeDefinition('custom')
  return {
    ...inspection,
    conflicts: [],
    contentRole: 'attachment',
    evidence: 'metadata',
    fileType,
    imageDimensions: null,
    previewIssue: null,
    previewKind: fileType.previewKind,
  }
}

export function SendPage() {
  const state = useSendStore((current) => current)
  const auth = useAuthSnapshot()
  const store = useSendStoreApi()
  const { submit } = useSendFlow()
  const [detailOpen, setDetailOpen] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [rawRecommendation, setRawRecommendation] =
    useState<RawRecommendation | null>(null)
  const blockRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const focusEditorAfterConversion = useRef(false)
  const textConversionControllerRef = useRef<AbortController | null>(null)
  const content = state.draft.content
  const text = content.kind === 'text' ? content.text : ''
  const textPreview = useMemo(() => createTextPreview(text), [text])
  const attachment = content.kind === 'attachment' ? content : null
  const conversion = state.phase === 'converting' ? state.conversion : null
  const {
    attachmentMessage,
    clearAttachmentMessage,
    fileDropMessage,
    fileInputRef,
    handleFileChange,
    handlePaste,
    isDraggingFile,
    openFilePicker,
    reportAttachmentMessage,
  } = useAttachmentImport({
    maxObjectBytes: MAX_OBJECT_BYTES,
    onPrepared: () => {
      setDetailOpen(false)
      setCopyMessage('')
    },
    sessionId: auth.sessionId,
    state,
    store,
  })

  useEffect(() => {
    if (
      !auth.sessionId ||
      state.phase !== 'editing' ||
      state.draft.content.kind !== 'text' ||
      state.draft.content.text.length === 0 ||
      state.draft.dismissedRawRevision === state.draft.revision
    ) {
      return
    }
    const controller = new AbortController()
    const request: RawTaskRequest = {
      draftId: state.draft.draftId,
      kind: 'detect',
      operationId: crypto.randomUUID(),
      revision: state.draft.revision,
      sessionId: auth.sessionId,
      text: state.draft.content.text,
    }
    const timer = globalThis.setTimeout(() => {
      void runRawTask(request, { signal: controller.signal })
        .then((response) => {
          if (
            !response.ok ||
            response.kind !== 'detect' ||
            !response.candidate
          ) {
            return
          }
          const current = store.getState()
          if (
            current.phase !== 'editing' ||
            current.draft.draftId !== response.draftId ||
            current.draft.revision !== response.revision ||
            auth.sessionId !== response.sessionId
          ) {
            return
          }
          setRawRecommendation({
            candidate: response.candidate,
            draftId: response.draftId,
            operationId: response.operationId,
            revision: response.revision,
            sessionId: response.sessionId,
          })
        })
        .catch(() => undefined)
    }, RAW_DETECTION_DELAY_MS)
    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
    }
  }, [
    auth.sessionId,
    state.draft.content,
    state.draft.dismissedRawRevision,
    state.draft.draftId,
    state.draft.revision,
    state.phase,
    store,
  ])

  useEffect(() => {
    if (!conversion || conversion.direction !== 'attachment-to-text') {
      return
    }
    const task = conversion
    const controller = new AbortController()
    const request: RawTaskRequest = {
      ...task.identity,
      body: task.source.body,
      encoding: task.encoding,
      kind: 'attachment-to-text',
      sourceText: task.source.sourceText,
    }
    void runRawTask(request, { signal: controller.signal })
      .then((response) => {
        if (response.ok && response.kind === 'attachment-to-text') {
          store.getState().completeAttachmentToText(response, response.text)
        } else if (!response.ok) {
          store.getState().failAttachmentToText(response)
          reportAttachmentMessage(response.message)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          store.getState().failAttachmentToText(task.identity)
          reportAttachmentMessage('附件转文本未完成，原附件已保留。')
        }
      })
    return () => controller.abort()
  }, [conversion, reportAttachmentMessage, store])

  useEffect(() => {
    if (state.phase === 'editing' && focusEditorAfterConversion.current) {
      focusEditorAfterConversion.current = false
      globalThis.setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [state.phase])

  useEffect(
    () => () => {
      textConversionControllerRef.current?.abort()
      textConversionControllerRef.current = null
      if (store.getState().phase === 'converting') {
        store.getState().cancelConversion()
      }
    },
    [store],
  )

  const handleConfirm = (event: FormEvent) => {
    event.preventDefault()
    const current = store.getState()
    if (
      rawRecommendation &&
      current.phase === 'editing' &&
      current.draft.content.kind === 'text' &&
      current.draft.draftId === rawRecommendation.draftId &&
      current.draft.revision === rawRecommendation.revision
    ) {
      current.dismissRawRecommendation(rawRecommendation)
      setRawRecommendation(null)
    }
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

  const confirmTextConversion = () => {
    const task = store.getState().beginTextConversion(MAX_OBJECT_BYTES)
    if (!task) return
    const request: RawTaskRequest = {
      draftId: task.draftId,
      kind: 'text-to-attachment',
      maxObjectBytes: task.maxObjectBytes,
      operationId: task.operationId,
      parameters: task.parameters,
      revision: task.revision,
      sessionId: task.sessionId,
      text: task.text,
    }
    textConversionControllerRef.current?.abort()
    const controller = new AbortController()
    textConversionControllerRef.current = controller
    void runRawTask(request, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          store.getState().failTextConversion(response, response.message)
          return
        }
        if (response.kind !== 'text-to-attachment') return
        const blob = new Blob([new Uint8Array(response.attachment.bytes)], {
          type: response.attachment.contentType,
        })
        const inspected = await inspectBlob({
          blob,
          contentType: response.attachment.contentType,
          disposition: 'attachment',
          filename: response.attachment.filename,
        })
        store.getState().completeTextConversion(response, {
          body: blob,
          contentType: response.attachment.contentType,
          filename: response.attachment.filename,
          inspection: selectedInspection(
            inspected.inspection,
            response.attachment.fileTypeId,
          ),
          kind: 'attachment',
          previewVersion: 0,
          sourceText: null,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          store
            .getState()
            .failTextConversion(task, '本地转换未完成，完整原文已保留。')
        }
      })
      .finally(() => {
        if (textConversionControllerRef.current === controller) {
          textConversionControllerRef.current = null
        }
      })
  }

  const cancelTextConversion = () => {
    textConversionControllerRef.current?.abort()
    textConversionControllerRef.current = null
    store.getState().cancelConversion()
  }

  const activeRawRecommendation =
    rawRecommendation &&
    auth.sessionId === rawRecommendation.sessionId &&
    state.phase === 'editing' &&
    state.draft.content.kind === 'text' &&
    state.draft.draftId === rawRecommendation.draftId &&
    state.draft.revision === rawRecommendation.revision &&
    state.draft.dismissedRawRevision !== state.draft.revision
      ? rawRecommendation
      : null

  const acceptRawRecommendation = () => {
    if (!activeRawRecommendation) return
    const recommendation = activeRawRecommendation
    const current = store.getState()
    if (
      current.phase !== 'editing' ||
      current.draft.content.kind !== 'text' ||
      current.draft.draftId !== recommendation.draftId ||
      current.draft.revision !== recommendation.revision ||
      current.draft.dismissedRawRevision === current.draft.revision
    ) {
      setRawRecommendation(null)
      return
    }
    setRawRecommendation(null)
    current.startTextConversion(
      recommendation.sessionId,
      recommendation.candidate,
    )
  }

  const dismissRawRecommendation = () => {
    if (!activeRawRecommendation) return
    store.getState().dismissRawRecommendation(activeRawRecommendation)
    setRawRecommendation(null)
  }

  const beginAttachmentToText = () => {
    if (!auth.sessionId) return
    if (!store.getState().beginAttachmentToText(auth.sessionId)) return
    setDetailOpen(false)
    clearAttachmentMessage()
    focusEditorAfterConversion.current = true
  }

  const isPreparing = state.phase === 'preparing'
  const sendDisabled = state.phase === 'sending' || state.phase === 'uncertain'
  const canSend = state.phase === 'ready' || state.phase === 'failed'
  const canModify = isMutableSendState(state) && state.phase !== 'editing'
  const fileTypeId = attachment?.inspection.fileType.id ?? 'txt'
  const blockTitle = attachment?.filename ?? '文本块'

  return (
    <section
      className="transfer-page send-page"
      aria-labelledby="send-title"
      onPaste={handlePaste}
    >
      <div className="transfer-page__heading">
        <h1 id="send-title">发送</h1>
      </div>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        onChange={handleFileChange}
        aria-label="选择附件"
      />

      {isDraggingFile ? (
        <output className="file-drop-feedback" aria-live="polite">
          <FilePlus2 aria-hidden="true" />
          <strong>{fileDropMessage}</strong>
        </output>
      ) : null}

      {state.phase === 'converting' &&
      state.conversion.direction === 'text-to-attachment' ? (
        <TextToAttachmentEditor
          conversion={state.conversion}
          maxObjectBytes={MAX_OBJECT_BYTES}
          onCancel={cancelTextConversion}
          onConfirm={confirmTextConversion}
          onUpdate={(options) => store.getState().updateTextConversion(options)}
        />
      ) : state.phase === 'converting' ? (
        <output className="local-task-status" aria-live="polite">
          <span className="activity-indicator" aria-hidden="true" />
          <strong>正在转为文本</strong>
          <span>
            {state.conversion.direction === 'attachment-to-text' &&
            state.conversion.source.sourceText !== null
              ? '正在恢复转换前保留的完整原文。'
              : state.conversion.direction === 'attachment-to-text' &&
                  state.conversion.encoding === 'base64'
                ? '图片或二进制附件将转换为标准 Base64 文本。'
                : '文本附件将按 UTF-8 解码。'}
          </span>
        </output>
      ) : isPreparing ? (
        <output className="local-task-status" aria-live="polite">
          <span className="activity-indicator" aria-hidden="true" />
          <strong>正在检查附件</strong>
          <span>准备完成前不会上传。</span>
        </output>
      ) : state.phase === 'editing' ? (
        <form className="text-editor" onSubmit={handleConfirm}>
          <label className="sr-only" htmlFor="send-text">
            正文
          </label>
          <textarea
            ref={textareaRef}
            aria-label="正文"
            id="send-text"
            rows={1}
            wrap="soft"
            value={text}
            onChange={(event) => store.getState().editText(event.target.value)}
            placeholder="正文"
          />
          {activeRawRecommendation ? (
            <section
              className="raw-recommendation"
              aria-labelledby="raw-recommendation-title"
            >
              <div>
                <strong id="raw-recommendation-title">
                  检测到可能的
                  {
                    getFileTypeDefinition(
                      activeRawRecommendation.candidate.fileTypeId,
                    ).label
                  }
                  内容
                </strong>
                <p>
                  可以先检查文件类型、文件名和解释方式；确认后才会生成附件，
                  完整原文仍会保留。
                </p>
              </div>
              <div className="raw-recommendation__actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={dismissRawRecommendation}
                >
                  保持文本
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={acceptRawRecommendation}
                >
                  查看转换设置
                </button>
              </div>
            </section>
          ) : null}
          <div className="draft-entry-actions">
            {text.length === 0 ? (
              <button
                className="secondary-button"
                type="button"
                onClick={openFilePicker}
              >
                <FilePlus2 aria-hidden="true" />
                <span>选择文件</span>
              </button>
            ) : null}
            <button
              className="primary-button transfer-primary"
              type="submit"
              disabled={text.length === 0}
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
                clearAttachmentMessage()
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
        open={
          detailOpen &&
          !['editing', 'preparing', 'converting'].includes(state.phase)
        }
        onClose={() => setDetailOpen(false)}
        preview={
          (attachment?.inspection.previewKind ?? 'plain-text') !==
          'metadata-only' ? (
            <PreviewSurface
              key={attachment?.previewVersion ?? state.draft.revision}
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
          {canModify ? (
            attachment ? (
              <>
                <button type="button" onClick={openFilePicker}>
                  <RefreshCw aria-hidden="true" />
                  替换
                </button>
                <button type="button" onClick={beginAttachmentToText}>
                  <FileInput aria-hidden="true" />
                  {attachment.sourceText === null ? '转为文本' : '恢复原文'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailOpen(false)
                    clearAttachmentMessage()
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
                  onClick={() => {
                    if (!auth.sessionId) return
                    setDetailOpen(false)
                    store.getState().startTextConversion(auth.sessionId)
                  }}
                >
                  <FileOutput aria-hidden="true" />
                  转为附件
                </button>
                <button type="button" onClick={openFilePicker}>
                  <FilePlus2 aria-hidden="true" />
                  替换为文件
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
