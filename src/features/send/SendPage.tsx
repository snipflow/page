import {
  ArrowLeft,
  Check,
  FileInput,
  FileOutput,
  FilePlus2,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SubmitEvent,
} from 'react'
import { AnimatePresence, LayoutGroup, m } from 'motion/react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { PreviewSurface } from '../../components/content-block/preview/PreviewSurface.tsx'
import {
  createTextPreview,
  getFileTypeDefinition,
  inspectBlob,
  isPreviewRenderable,
  parseMaxObjectBytes,
  requireSnipKey,
  requireTtlSeconds,
  SnipValidationError,
  textByteSize,
  type AttachmentDraftContent,
  type ContentInspection,
  type RawCandidate,
} from '../../domain/index.ts'
import { useAuthSnapshot } from '../auth/auth-context.ts'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { useMotionPreferences } from '../../motion/motion-context.ts'
import {
  MOTION_DURATION,
  SEND_COMPOSER_EASE,
} from '../../motion/motion-preferences.ts'
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
import {
  AttachmentFilenameEditor,
  AttachmentTypeEditor,
  InlineMetadataEditor,
  type InlineEditorRenderProps,
} from './InlineMetadataEditor.tsx'
import { FieldSelect, type FieldSelectOption } from './FieldSelect.tsx'

const MAX_OBJECT_BYTES = parseMaxObjectBytes(
  import.meta.env.VITE_MAX_OBJECT_BYTES,
)
const RAW_DETECTION_DELAY_MS = 600

type SentCredentialView = 'key' | 'url'

function createReceiveUrl(key: string) {
  return new URL(
    `/receive/${encodeURIComponent(key)}`,
    globalThis.location.origin,
  ).href
}

interface RawRecommendation extends RawTaskIdentity {
  candidate: RawCandidate
}

const TTL_OPTIONS = [
  { label: '1 小时', value: '3600' },
  { label: '24 小时', value: '86400' },
  { label: '7 天', value: '604800' },
  { label: '永久', value: 'permanent' },
] as const

function ttlLabel(value: string) {
  return (
    TTL_OPTIONS.find((option) => option.value === value)?.label ??
    (value === 'custom' ? '自定义秒数' : `${value} 秒`)
  )
}

const TTL_SELECT_OPTIONS: readonly FieldSelectOption<string>[] = TTL_OPTIONS

function TtlEditor({
  id,
  onChange,
  onKeyDown,
  value,
}: InlineEditorRenderProps) {
  const isPreset = TTL_OPTIONS.some((option) => option.value === value)
  const selectValue = isPreset ? value : 'custom'
  const customValue = !isPreset && value !== 'custom' ? value : ''

  return (
    <fieldset className="ttl-editor">
      <legend className="sr-only">有效期编辑</legend>
      <FieldSelect
        id={id}
        ariaLabel="有效期选项"
        options={TTL_SELECT_OPTIONS}
        value={selectValue}
        valueLabel={ttlLabel(value)}
        onKeyDown={onKeyDown}
        onChange={(nextValue) => onChange(nextValue)}
        popupFooter={
          <div className="ttl-editor__custom">
            <label htmlFor={`${id}-custom`}>自定义秒数</label>
            <div className="ttl-editor__custom-control">
              <input
                id={`${id}-custom`}
                aria-label="自定义有效期（秒）"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={customValue}
                placeholder="输入正整数"
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') event.stopPropagation()
                }}
              />
              <span>秒</span>
            </div>
          </div>
        }
      />
    </fieldset>
  )
}

function keyEditError(error: unknown) {
  return error instanceof SnipValidationError && error.field === 'key'
    ? 'Key 只能包含字母、数字、下划线或连字符。'
    : 'Key 未更新，请检查后重试。'
}

function ttlEditError(error: unknown) {
  return error instanceof SnipValidationError && error.field === 'ttl'
    ? '有效期必须是大于 0 的整数秒。'
    : '有效期未更新，请检查后重试。'
}

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
  const [credentialView, setCredentialView] =
    useState<SentCredentialView>('key')
  const [rawRecommendation, setRawRecommendation] =
    useState<RawRecommendation | null>(null)
  const { documentVisible, level } = useMotionPreferences()
  const motionLevel = documentVisible ? level : 'reduced'
  const composerMotion = motionLevel === 'full'
  const presenceMotion = motionLevel !== 'reduced'
  const blockRef = useRef<HTMLButtonElement>(null)
  const keyCredentialTabRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const urlCredentialTabRef = useRef<HTMLButtonElement>(null)
  const focusEditorOnNextEditing = useRef(false)
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
      maxObjectBytes: MAX_OBJECT_BYTES,
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
    if (state.phase === 'editing' && focusEditorOnNextEditing.current) {
      focusEditorOnNextEditing.current = false
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

  const handleConfirm = (event: SubmitEvent) => {
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

  const deleteDraft = () => {
    setDetailOpen(false)
    setCopyMessage('')
    setRawRecommendation(null)
    clearAttachmentMessage()
    focusEditorOnNextEditing.current = true
    store.getState().startNewDraft()
  }

  const selectCredentialView = (view: SentCredentialView) => {
    setCredentialView(view)
    setCopyMessage('')
  }

  const handleCredentialTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: SentCredentialView,
  ) => {
    let nextView: SentCredentialView | null = null
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      nextView = currentView === 'key' ? 'url' : 'key'
    } else if (event.key === 'Home') {
      nextView = 'key'
    } else if (event.key === 'End') {
      nextView = 'url'
    }
    if (!nextView) return
    event.preventDefault()
    selectCredentialView(nextView)
    const targetRef =
      nextView === 'key' ? keyCredentialTabRef : urlCredentialTabRef
    targetRef.current?.focus()
  }

  const copyCredential = async () => {
    if (state.phase !== 'sent') return
    const value =
      credentialView === 'key'
        ? state.result.key
        : createReceiveUrl(state.result.key)
    try {
      await copyTextToClipboard(value)
      setCopyMessage(`${credentialView === 'key' ? 'Key' : 'URL'} 已复制`)
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
    focusEditorOnNextEditing.current = true
  }

  const isPreparing = state.phase === 'preparing'
  const sendDisabled = state.phase === 'sending' || state.phase === 'uncertain'
  const canSend = state.phase === 'ready' || state.phase === 'failed'
  const canModify = isMutableSendState(state) && state.phase !== 'editing'
  const fileTypeId = attachment?.inspection.fileType.id ?? 'txt'
  const blockTitle = attachment?.filename ?? '文本块'
  const keyValue = state.draft.options.key ?? ''
  const displayedKey = state.phase === 'sent' ? state.result.key : keyValue
  const ttlValue =
    state.draft.options.ttlSeconds === null
      ? 'permanent'
      : String(state.draft.options.ttlSeconds)
  const canEditKey =
    state.phase === 'ready' ||
    state.phase === 'failed' ||
    state.phase === 'conflict'
  const canEditTtl = state.phase === 'ready' || state.phase === 'failed'
  const isPrepared = !['editing', 'preparing', 'converting'].includes(
    state.phase,
  )
  const composerLayoutId = composerMotion
    ? `send-composer-${state.draft.draftId}`
    : undefined
  const wasPreparedRef = useRef(isPrepared)
  const [composerContentVisible, setComposerContentVisible] = useState(true)

  useLayoutEffect(() => {
    const becamePrepared = !wasPreparedRef.current && isPrepared
    wasPreparedRef.current = isPrepared
    if (!becamePrepared || !composerMotion) {
      setComposerContentVisible(true)
      return
    }
    setComposerContentVisible(false)
    const timer = globalThis.setTimeout(
      () => setComposerContentVisible(true),
      MOTION_DURATION.sendComposer * 1000,
    )
    return () => globalThis.clearTimeout(timer)
  }, [isPrepared, composerMotion])

  return (
    <section
      className="transfer-page send-page"
      data-transfer-view="send"
      data-route-gesture-surface
      tabIndex={-1}
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

      <LayoutGroup id={`send-composer-group-${state.draft.draftId}`}>
        <div className="send-composer" data-motion-level={motionLevel}>
          <AnimatePresence initial={false} mode="sync">
            {state.phase === 'converting' &&
            state.conversion.direction === 'text-to-attachment' ? (
              <m.div
                key="text-to-attachment-conversion"
                className="send-composer-state"
                initial={presenceMotion ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                {...(presenceMotion ? { exit: { opacity: 0, y: -8 } } : {})}
                transition={{
                  duration: presenceMotion ? MOTION_DURATION.fast : 0,
                  ease: SEND_COMPOSER_EASE,
                }}
              >
                <TextToAttachmentEditor
                  conversion={state.conversion}
                  maxObjectBytes={MAX_OBJECT_BYTES}
                  onCancel={cancelTextConversion}
                  onConfirm={confirmTextConversion}
                  onUpdate={(options) =>
                    store.getState().updateTextConversion(options)
                  }
                />
              </m.div>
            ) : state.phase === 'converting' ? (
              <m.output
                key="attachment-to-text-conversion"
                className="local-task-status"
                aria-live="polite"
                initial={presenceMotion ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                {...(presenceMotion ? { exit: { opacity: 0, y: -8 } } : {})}
                transition={{
                  duration: presenceMotion ? MOTION_DURATION.fast : 0,
                  ease: SEND_COMPOSER_EASE,
                }}
              >
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
              </m.output>
            ) : isPreparing ? (
              <m.output
                key="attachment-preparation"
                className="local-task-status"
                aria-live="polite"
                layout={composerMotion}
                initial={presenceMotion ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                {...(presenceMotion ? { exit: { opacity: 0, y: -8 } } : {})}
                transition={{
                  duration: presenceMotion ? MOTION_DURATION.fast : 0,
                  ease: SEND_COMPOSER_EASE,
                }}
                {...(composerLayoutId ? { layoutId: composerLayoutId } : {})}
              >
                <span className="activity-indicator" aria-hidden="true" />
                <strong>正在检查附件</strong>
                <span>准备完成前不会上传。</span>
              </m.output>
            ) : state.phase === 'editing' ? (
              <m.form
                key="text-editor"
                className="text-editor"
                data-route-gesture-exclude
                onSubmit={handleConfirm}
                initial={presenceMotion ? { opacity: 1 } : false}
                animate={{ opacity: 1 }}
                {...(presenceMotion
                  ? {
                      exit: {
                        opacity: 0,
                        transition: {
                          opacity: {
                            duration: MOTION_DURATION.sendComposer * 0.44,
                          },
                        },
                      },
                    }
                  : {})}
              >
                <label className="sr-only" htmlFor="send-text">
                  正文
                </label>
                <m.textarea
                  ref={textareaRef}
                  aria-label="正文"
                  id="send-text"
                  rows={1}
                  wrap="soft"
                  value={text}
                  onChange={(event) =>
                    store.getState().editText(event.target.value)
                  }
                  placeholder="正文"
                  {...(composerLayoutId ? { layoutId: composerLayoutId } : {})}
                  transition={{
                    layout: {
                      duration: composerMotion
                        ? MOTION_DURATION.sendComposer
                        : 0,
                      ease: SEND_COMPOSER_EASE,
                    },
                  }}
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
                  <AnimatePresence initial={false} mode="sync">
                    {text.length === 0 ? (
                      <m.button
                        key="file-picker"
                        layout="position"
                        className="secondary-button"
                        type="button"
                        onClick={openFilePicker}
                        initial={
                          presenceMotion
                            ? { opacity: 0, scale: 0.78, x: 12 }
                            : false
                        }
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        {...(presenceMotion
                          ? { exit: { opacity: 0, scale: 0.78, x: 12 } }
                          : {})}
                        transition={{
                          duration: presenceMotion
                            ? MOTION_DURATION.sendPicker
                            : 0,
                          ease: SEND_COMPOSER_EASE,
                        }}
                      >
                        <FilePlus2 aria-hidden="true" />
                        <span>选择文件</span>
                      </m.button>
                    ) : null}
                    <m.button
                      key="confirm-text"
                      layout="position"
                      className="primary-button transfer-primary"
                      type="submit"
                      disabled={text.length === 0}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: presenceMotion
                          ? MOTION_DURATION.sendPicker
                          : 0,
                        ease: SEND_COMPOSER_EASE,
                      }}
                    >
                      <Check aria-hidden="true" />
                      <span>完成</span>
                    </m.button>
                  </AnimatePresence>
                </div>
              </m.form>
            ) : (
              <m.div
                key="prepared-content"
                className="prepared-content"
                data-route-gesture-exclude
                data-composer-content={
                  composerContentVisible ? 'visible' : 'hidden'
                }
                layout={composerMotion}
                initial={
                  presenceMotion ? { opacity: composerMotion ? 1 : 0 } : false
                }
                animate={{ opacity: 1 }}
                {...(presenceMotion ? { exit: { opacity: 0 } } : {})}
                transition={{
                  layout: {
                    duration: composerMotion ? MOTION_DURATION.sendComposer : 0,
                    ease: SEND_COMPOSER_EASE,
                  },
                  opacity: {
                    duration: presenceMotion ? MOTION_DURATION.fast : 0,
                  },
                }}
              >
                <m.div
                  className="send-composer-block"
                  {...(composerLayoutId ? { layoutId: composerLayoutId } : {})}
                  transition={{
                    layout: {
                      duration: composerMotion
                        ? MOTION_DURATION.sendComposer
                        : 0,
                      ease: SEND_COMPOSER_EASE,
                    },
                  }}
                >
                  <ContentBlock
                    bodyRef={blockRef}
                    fileTypeId={fileTypeId}
                    motionId={`send-detail-${state.draft.draftId}`}
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
                </m.div>

                {state.phase === 'sent' ? (
                  <div className="send-credential">
                    <div
                      className="send-credential__tabs"
                      role="tablist"
                      aria-label="发送结果访问方式"
                      aria-orientation="vertical"
                    >
                      <button
                        ref={keyCredentialTabRef}
                        className="send-credential__tab"
                        id="sent-credential-key-tab"
                        type="button"
                        role="tab"
                        aria-controls="sent-credential-value"
                        aria-selected={credentialView === 'key'}
                        tabIndex={credentialView === 'key' ? 0 : -1}
                        onClick={() => selectCredentialView('key')}
                        onKeyDown={(event) =>
                          handleCredentialTabKeyDown(event, 'key')
                        }
                      >
                        Key
                      </button>
                      <button
                        ref={urlCredentialTabRef}
                        className="send-credential__tab"
                        id="sent-credential-url-tab"
                        type="button"
                        role="tab"
                        aria-controls="sent-credential-value"
                        aria-selected={credentialView === 'url'}
                        tabIndex={credentialView === 'url' ? 0 : -1}
                        onClick={() => selectCredentialView('url')}
                        onKeyDown={(event) =>
                          handleCredentialTabKeyDown(event, 'url')
                        }
                      >
                        URL
                      </button>
                    </div>
                    <div
                      className="send-credential__panel"
                      id="sent-credential-value"
                      role="tabpanel"
                      aria-labelledby={`sent-credential-${credentialView}-tab`}
                    >
                      <button
                        className="send-credential__value"
                        type="button"
                        onClick={copyCredential}
                        aria-label={`复制 ${credentialView === 'key' ? 'Key' : 'URL'}`}
                        title={`单击复制 ${credentialView === 'key' ? 'Key' : 'URL'}`}
                      >
                        <strong>
                          {credentialView === 'key'
                            ? state.result.key
                            : createReceiveUrl(state.result.key)}
                        </strong>
                      </button>
                    </div>
                  </div>
                ) : null}

                {state.phase === 'sent' ? (
                  <button
                    className="icon-button sent-return-button"
                    type="button"
                    onClick={() => {
                      setDetailOpen(false)
                      setCopyMessage('')
                      setCredentialView('key')
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
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              store.getState().enableOverwrite()
                              submit()
                            }}
                          >
                            确认覆盖并发送
                          </button>
                          <button
                            type="button"
                            onClick={() => store.getState().dismissConflict()}
                          >
                            返回修改
                          </button>
                        </>
                      ) : null}
                      {state.phase === 'uncertain' ? (
                        <button
                          type="button"
                          onClick={() =>
                            store.getState().acknowledgeUncertain()
                          }
                        >
                          我知道了，返回待发送
                        </button>
                      ) : null}
                      {state.phase === 'failed' && !attachment ? (
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
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {attachmentMessage ? (
        <div className="operation-feedback attachment-feedback" role="alert">
          <p>{attachmentMessage}</p>
        </div>
      ) : null}

      <DetailDialog
        eyebrow={attachment?.inspection.fileType.label ?? 'TXT'}
        motionId={`send-detail-${state.draft.draftId}`}
        title={
          attachment
            ? attachment.filename
            : state.phase === 'sent'
              ? state.result.key
              : '文本详情'
        }
        titleContent={
          attachment ? (
            <AttachmentFilenameEditor
              attachment={attachment}
              canEdit={canModify}
              onApply={(update) =>
                store.getState().updateAttachmentMetadata(update)
              }
            />
          ) : undefined
        }
        open={
          detailOpen &&
          !['editing', 'preparing', 'converting'].includes(state.phase)
        }
        onClose={() => setDetailOpen(false)}
        preview={
          isPreviewRenderable(
            attachment?.inspection.previewKind ?? 'plain-text',
          ) ? (
            <PreviewSurface
              key={attachment?.previewVersion ?? state.draft.revision}
              blob={attachment?.body ?? null}
              contentType={attachment?.contentType ?? 'text/plain'}
              previewKind={attachment?.inspection.previewKind ?? 'plain-text'}
              text={attachment ? null : textPreview.text}
              truncated={attachment ? false : textPreview.truncated}
            />
          ) : null
        }
        returnFocusRef={blockRef}
      >
        {!isPreviewRenderable(
          attachment?.inspection.previewKind ?? 'plain-text',
        ) ? (
          <p>此类型仅提供文件信息</p>
        ) : null}
        <dl className="metadata-list">
          <div>
            <dt>大小</dt>
            <dd>{attachment ? attachment.body.size : textByteSize(text)} B</dd>
          </div>
          <div>
            <dt>MIME</dt>
            <dd>
              {attachment ? (
                <AttachmentTypeEditor
                  attachment={attachment}
                  canEdit={canModify}
                  onApply={(update) =>
                    store.getState().updateAttachmentMetadata(update)
                  }
                />
              ) : (
                'text/plain'
              )}
            </dd>
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
          <div>
            <dt>Key</dt>
            <dd>
              <InlineMetadataEditor
                canEdit={canEditKey}
                displayValue={displayedKey || '自动生成'}
                editLabel="Key"
                isPlaceholder={!displayedKey}
                value={keyValue}
                errorMessage={keyEditError}
                onCommit={(value) => {
                  const key = value === '' ? null : requireSnipKey(value)
                  store.getState().updateOptions({ key, overwrite: false })
                  return true
                }}
                renderEditor={({ id, onChange, onKeyDown, value }) => (
                  <input
                    id={id}
                    aria-label="Key"
                    value={value}
                    maxLength={128}
                    pattern="(?:[A-Za-z0-9_]|-)+"
                    placeholder="自动生成"
                    autoComplete="off"
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                  />
                )}
              />
            </dd>
          </div>
          <div>
            <dt>有效期</dt>
            <dd>
              <InlineMetadataEditor
                canEdit={canEditTtl}
                displayValue={ttlLabel(ttlValue)}
                editLabel="有效期"
                value={ttlValue}
                errorMessage={ttlEditError}
                onCommit={(value) => {
                  const ttlSeconds =
                    value === 'permanent' || value === 'custom'
                      ? value === 'permanent'
                        ? null
                        : requireTtlSeconds(Number.NaN)
                      : requireTtlSeconds(Number(value))
                  store.getState().updateOptions({
                    ttlSeconds,
                  })
                  return true
                }}
                renderEditor={(props) => <TtlEditor {...props} />}
              />
            </dd>
          </div>
        </dl>

        <div className="dialog-actions block-detail-actions">
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
          {canModify ? (
            <button
              className="danger-button"
              type="button"
              onClick={deleteDraft}
            >
              <Trash2 aria-hidden="true" />
              删除
            </button>
          ) : null}
        </div>
      </DetailDialog>
    </section>
  )
}
