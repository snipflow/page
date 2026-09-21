import { Check, Copy, Download, Trash2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, LayoutGroup, m } from 'motion/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { isPreviewRenderable, parseMimeType } from '../../domain/index.ts'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { PreviewSurface } from '../../components/content-block/preview/PreviewSurface.tsx'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { triggerBlobDownload } from '../transfer/object-url-registry.ts'
import { useObjectUrlRegistry } from '../transfer/use-object-url.ts'
import { useMotionPreferences } from '../../motion/motion-context.ts'
import {
  MOTION_DURATION,
  SEND_COMPOSER_EASE,
} from '../../motion/motion-preferences.ts'
import { useReceiveStore, useReceiveStoreApi } from './receive-store.ts'
import { useReceiveFlow } from './use-receive-flow.ts'

const RECEIVE_PENDING_TIME_CONSTANT_MS = 4_000
const RECEIVE_FINISH_RATE_PER_SECOND = 0.9

function formatIndexTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

interface ReceivePageProps {
  routeKey?: string
}

export function ReceivePage({ routeKey }: ReceivePageProps = {}) {
  const inputKey = useReceiveStore((state) => state.inputKey)
  const view = useReceiveStore((state) => state.view)
  const deleteState = useReceiveStore((state) => state.deleteState)
  const store = useReceiveStoreApi()
  const objectUrls = useObjectUrlRegistry()
  const navigate = useNavigate()
  const { confirmDelete, data, finishRead, returnToInput, submit } =
    useReceiveFlow()
  const { documentVisible, level } = useMotionPreferences()
  const motionLevel = documentVisible ? level : 'reduced'
  const composerMotion = motionLevel === 'full'
  const presenceMotion = motionLevel !== 'reduced'
  const [detailOperationId, setDetailOperationId] = useState<string | null>(
    null,
  )
  const [actionMessage, setActionMessage] = useState('')
  const [blockAction, setBlockAction] = useState<{
    operationId: string | null
    state: 'idle' | 'success'
  }>({ operationId: null, state: 'idle' })
  const [receiveCoverage, setReceiveCoverage] = useState({
    operationId: null as string | null,
    value: 0,
  })
  const receiveCoverageRef = useRef(0)
  const receiveAnimationOperationRef = useRef<string | null>(null)
  const blockRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmDeleteRef = useRef<HTMLButtonElement>(null)
  const autoSubmittedKeyRef = useRef<string | null>(null)

  const detailOpen =
    view.status === 'result' && view.result.operationId === detailOperationId
  const resultOperationId =
    view.status === 'result' ? view.result.operationId : null
  const blockActionState =
    blockAction.operationId === resultOperationId ? blockAction.state : 'idle'
  const receiveLayoutId = composerMotion ? 'receive-content-shell' : undefined
  const receiveOperation = view.status === 'loading' ? view.operation : null
  const receiveComplete = view.status === 'loading' && view.loading.complete

  const navigateToInput = useCallback(() => {
    returnToInput()
    if (routeKey) {
      void navigate({ to: '/receive' })
    }
  }, [navigate, returnToInput, routeKey])

  useEffect(() => {
    if (!routeKey) {
      autoSubmittedKeyRef.current = null
      if (view.status === 'result') {
        returnToInput()
      }
      return
    }
    if (autoSubmittedKeyRef.current === routeKey) return
    autoSubmittedKeyRef.current = routeKey
    const current = store.getState().view
    if (current.status === 'result' && current.result.key === routeKey) {
      return
    }
    store.getState().setInputKey(routeKey)
    submit()
  }, [routeKey, returnToInput, store, submit, view.status])

  useEffect(() => {
    if (view.status !== 'result' || detailOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        navigateToInput()
        globalThis.setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [detailOpen, navigateToInput, view.status])

  useEffect(() => {
    if (deleteState.status === 'confirming') {
      confirmDeleteRef.current?.focus()
    }
  }, [deleteState.status])

  useEffect(() => {
    if (!receiveOperation) return

    const publishCoverage = (coverage: number) => {
      receiveCoverageRef.current = coverage
      setReceiveCoverage({
        operationId: receiveOperation.operationId,
        value: coverage,
      })
    }
    if (receiveAnimationOperationRef.current !== receiveOperation.operationId) {
      receiveAnimationOperationRef.current = receiveOperation.operationId
      publishCoverage(0)
    }

    if (motionLevel === 'reduced') {
      if (receiveComplete) {
        publishCoverage(1)
        const timer = globalThis.setTimeout(() => {
          finishRead(receiveOperation)
        }, 0)
        return () => globalThis.clearTimeout(timer)
      }
      publishCoverage(0.4)
      return
    }

    let frame: number
    const startedAt = performance.now()
    const startingCoverage = receiveCoverageRef.current
    const animate = (timestamp: number) => {
      const elapsed = Math.max(0, timestamp - startedAt)
      if (!receiveComplete) {
        const inverseProgress =
          elapsed / (elapsed + RECEIVE_PENDING_TIME_CONSTANT_MS)
        publishCoverage(
          startingCoverage +
            (1 - startingCoverage) * inverseProgress,
        )
        frame = requestAnimationFrame(animate)
        return
      }

      const nextCoverage = Math.min(
        1,
        startingCoverage + (elapsed / 1_000) * RECEIVE_FINISH_RATE_PER_SECOND,
      )
      publishCoverage(nextCoverage)
      if (nextCoverage < 1) {
        frame = requestAnimationFrame(animate)
        return
      }

      frame = requestAnimationFrame(() => {
        finishRead(receiveOperation)
      })
    }
    frame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(frame)
  }, [finishRead, motionLevel, receiveComplete, receiveOperation])

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    setActionMessage('')
    const key = store.getState().inputKey
    if (!routeKey || routeKey !== key) {
      void navigate({ to: '/receive/$key', params: { key } })
      return
    }
    submit()
  }

  const copyBody = async () => {
    if (!data || data.fullText === null) return false
    try {
      await copyTextToClipboard(data.fullText)
      setActionMessage('')
      return true
    } catch {
      setActionMessage('复制失败，请在详情中选择正文')
      if (view.status === 'result') {
        setDetailOperationId(view.result.operationId)
      }
      return false
    }
  }

  const downloadBody = () => {
    if (!data) return
    triggerBlobDownload(
      objectUrls,
      data.object.body,
      data.object.metadata.downloadFilename,
    )
  }

  const copyBlockBody = async () => {
    setBlockAction({ operationId: resultOperationId, state: 'success' })
    const copied = await copyBody()
    if (!copied) setBlockAction({ operationId: null, state: 'idle' })
  }

  const downloadBlockBody = () => {
    downloadBody()
    setActionMessage('')
    setBlockAction({ operationId: resultOperationId, state: 'success' })
  }

  const showInput = view.status === 'input' || view.status === 'error'
  const isCopyable =
    data?.inspection.contentRole === 'inline-text' && data.fullText !== null
  const fileType = data?.inspection.fileType
  const blockTitle = data
    ? (data.object.metadata.serverFilename ??
      (fileType?.id === 'txt'
        ? '接收的文本块'
        : `接收的 ${fileType?.label} 正文`))
    : '接收内容'

  return (
    <section
      className="transfer-page receive-page"
      data-transfer-view="receive"
      data-route-gesture-surface
      tabIndex={-1}
      aria-labelledby="receive-title"
    >
      {view.status === 'result' ? (
        <button
          className="receive-background-return"
          data-route-gesture-allow-interactive
          type="button"
          onClick={navigateToInput}
          aria-label="返回 Key 输入"
          title="返回 Key 输入"
        />
      ) : null}
      <div className="transfer-page__heading">
        <h1 id="receive-title">接收</h1>
      </div>

      <LayoutGroup id="receive-content-transition">
        <div className="receive-composer">
          <AnimatePresence initial={false} mode="sync">
            {showInput ? (
              <m.form
                key="receive-input"
                className="receive-form"
                data-route-gesture-exclude
                onSubmit={handleSubmit}
                initial={presenceMotion ? { opacity: 0 } : false}
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
                transition={{
                  opacity: {
                    duration: presenceMotion ? MOTION_DURATION.fast : 0,
                  },
                }}
              >
                <label className="sr-only" htmlFor="receive-key">
                  Key
                </label>
                <m.input
                  ref={inputRef}
                  id="receive-key"
                  value={inputKey}
                  onChange={(event) =>
                    store.getState().setInputKey(event.target.value)
                  }
                  maxLength={128}
                  pattern="(?:[A-Za-z0-9_]|-)+"
                  autoComplete="off"
                  placeholder="Key"
                  {...(receiveLayoutId ? { layoutId: receiveLayoutId } : {})}
                  transition={{
                    layout: {
                      duration: composerMotion
                        ? MOTION_DURATION.sendComposer
                        : 0,
                      ease: SEND_COMPOSER_EASE,
                    },
                  }}
                />
                <div className="draft-entry-actions">
                  <button
                    className="primary-button transfer-primary"
                    type="submit"
                    disabled={inputKey.length === 0}
                    aria-label="获取内容"
                  >
                    <Check aria-hidden="true" />
                    <span>完成</span>
                  </button>
                </div>
                {view.status === 'error' ? (
                  <div className="operation-feedback" role="alert">
                    <p>{view.failure.message}</p>
                    {view.failure.requestId ? (
                      <small>请求编号：{view.failure.requestId}</small>
                    ) : null}
                  </div>
                ) : null}
              </m.form>
            ) : null}

            {view.status === 'loading' ||
            (view.status === 'result' && data) ? (
              <m.div
                key="receive-content"
                className={`prepared-content receive-prepared-content${
                  view.status === 'loading' ? ' receive-coverage-shell' : ''
                }`}
                data-route-gesture-exclude
                aria-busy={view.status === 'loading' ? 'true' : undefined}
                aria-live={view.status === 'loading' ? 'polite' : undefined}
                initial={presenceMotion ? { opacity: 1 } : false}
                animate={{ opacity: 1 }}
                {...(presenceMotion ? { exit: { opacity: 0 } } : {})}
                transition={{
                  opacity: {
                    duration: presenceMotion ? MOTION_DURATION.fast : 0,
                  },
                }}
              >
                <m.div
                  className="receive-composer-block"
                  {...(receiveLayoutId ? { layoutId: receiveLayoutId } : {})}
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
                    {...(view.status === 'result'
                      ? {
                          bodyRef: blockRef,
                          motionId: `receive-detail-${view.result.operationId}`,
                          revealPhase: 'ready' as const,
                        }
                      : {})}
                    fileTypeId={
                      view.status === 'loading'
                        ? view.loading.fileTypeId
                        : data!.inspection.fileType.id
                    }
                    onOpen={() => {
                      if (view.status === 'result') {
                        setDetailOperationId(view.result.operationId)
                      }
                    }}
                    {...(view.status === 'loading'
                      ? {
                          receiveCoverage:
                            receiveCoverage.operationId ===
                            view.operation.operationId
                              ? receiveCoverage.value
                              : 0,
                        }
                      : {
                          quickAction: isCopyable
                            ? {
                                disabled: blockActionState === 'success',
                                icon: <Copy aria-hidden="true" />,
                                label:
                                  blockActionState === 'success'
                                    ? '复制完成'
                                    : '复制正文',
                                onAction: copyBlockBody,
                                state: blockActionState,
                              }
                            : {
                                disabled: blockActionState === 'success',
                                icon: <Download aria-hidden="true" />,
                                label:
                                  blockActionState === 'success'
                                    ? '下载已开始'
                                    : `下载 ${data!.object.metadata.downloadFilename}`,
                                onAction: downloadBlockBody,
                                state: blockActionState,
                              },
                        })}
                    title={view.status === 'loading' ? '内容' : blockTitle}
                  />
                </m.div>
                {view.status === 'loading' ? (
                  <>
                    <span className="sr-only">获取中</span>
                    <button
                      className="receive-loading-cancel sr-only"
                      type="button"
                      onClick={navigateToInput}
                      aria-label="返回"
                    >
                      返回
                    </button>
                  </>
                ) : actionMessage ? (
                  <p className="clipboard-feedback" role="alert">
                    {actionMessage}
                  </p>
                ) : null}
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      <DetailDialog
        eyebrow={fileType?.label ?? 'FILE'}
        {...(view.status === 'result'
          ? { motionId: `receive-detail-${view.result.operationId}` }
          : {})}
        title={
          data?.object.metadata.serverFilename ??
          (view.status === 'result' ? view.result.key : '内容详情')
        }
        open={detailOpen && view.status === 'result' && Boolean(data)}
        onClose={() => {
          if (deleteState.status === 'deleting') return false
          if (deleteState.status === 'confirming') {
            store.getState().cancelDelete()
            return false
          }
          store.getState().cancelDelete()
          setDetailOperationId(null)
          return true
        }}
        preview={
          data && isPreviewRenderable(data.inspection.previewKind) ? (
            <PreviewSurface
              blob={data.object.body}
              contentType={data.object.metadata.contentType}
              previewKind={data.inspection.previewKind}
              text={data.previewText}
              truncated={data.previewTruncated}
            />
          ) : null
        }
        returnFocusRef={blockRef}
      >
        {data ? (
          <>
            {data && !isPreviewRenderable(data.inspection.previewKind) ? (
              <p>此类型仅提供文件信息</p>
            ) : null}
            <dl className="metadata-list">
              <div>
                <dt>Key</dt>
                <dd>{data.object.key}</dd>
              </div>
              {data.object.metadata.serverFilename ? (
                <div>
                  <dt>文件名</dt>
                  <dd>{data.object.metadata.serverFilename}</dd>
                </div>
              ) : null}
              <div>
                <dt>实际大小</dt>
                <dd>{data.object.body.size} B</dd>
              </div>
              {data.object.metadata.contentLength !== null ? (
                <div>
                  <dt>响应大小</dt>
                  <dd>{data.object.metadata.contentLength} B</dd>
                </div>
              ) : null}
              <div>
                <dt>MIME</dt>
                <dd>
                  {parseMimeType(data.object.metadata.contentType)?.essence ??
                    data.object.metadata.contentType}
                </dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>
                  {data.object.metadata.createdAt
                    ? formatIndexTime(data.object.metadata.createdAt)
                    : '未知'}
                </dd>
              </div>
              <div>
                <dt>到期时间</dt>
                <dd>
                  {data.object.metadata.expiresAt
                    ? formatIndexTime(data.object.metadata.expiresAt)
                    : data.object.metadata.issues.includes('invalid-expiresAt')
                      ? '未知'
                      : '永久'}
                </dd>
              </div>
              {data.inspection.imageDimensions ? (
                <div>
                  <dt>尺寸</dt>
                  <dd>
                    {data.inspection.imageDimensions.width} ×{' '}
                    {data.inspection.imageDimensions.height}
                  </dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : null}

        {deleteState.status === 'confirming' ? (
          <div
            className="delete-confirmation"
            role="alertdialog"
            aria-modal="true"
          >
            <p>确认删除这个对象？</p>
            <div className="dialog-actions block-detail-actions">
              <button
                ref={confirmDeleteRef}
                className="danger-button"
                type="button"
                onClick={() => confirmDelete(navigateToInput)}
              >
                <Trash2 aria-hidden="true" />
                确认删除
              </button>
              <button
                type="button"
                onClick={() => store.getState().cancelDelete()}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions block-detail-actions">
            {isCopyable ? (
              <button type="button" onClick={copyBody}>
                <Copy aria-hidden="true" />
                复制正文
              </button>
            ) : data ? (
              <button type="button" onClick={downloadBody}>
                <Download aria-hidden="true" />
                下载
              </button>
            ) : null}
            <button
              className="danger-button"
              type="button"
              onClick={() => store.getState().requestDelete()}
              disabled={deleteState.status === 'deleting'}
            >
              <Trash2 aria-hidden="true" />
              {deleteState.status === 'deleting' ? '删除中' : '删除'}
            </button>
          </div>
        )}

        {deleteState.status === 'failed' ||
        deleteState.status === 'uncertain' ? (
          <div className="operation-feedback" role="alert">
            <p>{deleteState.message}</p>
            <button
              type="button"
              onClick={() => store.getState().cancelDelete()}
            >
              关闭提示
            </button>
          </div>
        ) : null}
      </DetailDialog>
    </section>
  )
}
