import { Copy, Download, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { PreviewSurface } from '../../components/content-block/PreviewSurface.tsx'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { triggerBlobDownload } from '../transfer/object-url-registry.ts'
import { useObjectUrlRegistry } from '../transfer/use-object-url.ts'
import { useReceiveStore, useReceiveStoreApi } from './receive-store.ts'
import { useReceiveFlow } from './use-receive-flow.ts'

export function ReceivePage() {
  const inputKey = useReceiveStore((state) => state.inputKey)
  const view = useReceiveStore((state) => state.view)
  const deleteState = useReceiveStore((state) => state.deleteState)
  const store = useReceiveStoreApi()
  const objectUrls = useObjectUrlRegistry()
  const { confirmDelete, data, returnToInput, submit } = useReceiveFlow()
  const [detailOperationId, setDetailOperationId] = useState<string | null>(
    null,
  )
  const [actionMessage, setActionMessage] = useState('')
  const blockRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmDeleteRef = useRef<HTMLButtonElement>(null)

  const detailOpen =
    view.status === 'result' && view.result.operationId === detailOperationId

  useEffect(() => {
    if (view.status !== 'result' || detailOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        returnToInput()
        globalThis.setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [detailOpen, returnToInput, view.status])

  useEffect(() => {
    if (deleteState.status === 'confirming') {
      confirmDeleteRef.current?.focus()
    }
  }, [deleteState.status])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setActionMessage('')
    submit()
  }

  const copyBody = async () => {
    if (!data || data.fullText === null) return
    try {
      await copyTextToClipboard(data.fullText)
      setActionMessage('正文已复制')
    } catch {
      setActionMessage('复制失败，请在详情中选择正文')
      if (view.status === 'result') {
        setDetailOperationId(view.result.operationId)
      }
    }
  }

  const downloadBody = () => {
    if (!data) return
    triggerBlobDownload(
      objectUrls,
      data.object.body,
      data.object.metadata.downloadFilename,
    )
    setActionMessage('已开始下载')
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
      aria-labelledby="receive-title"
    >
      {view.status === 'result' ? (
        <button
          className="receive-background-return"
          type="button"
          onClick={returnToInput}
          aria-label="返回 Key 输入"
          title="返回 Key 输入"
        />
      ) : null}
      <div className="transfer-page__heading">
        <h1 id="receive-title">接收</h1>
      </div>

      {showInput ? (
        <form className="receive-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="receive-key">
            Key
          </label>
          <div className="receive-key-field">
            <input
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
            />
            <button
              className="icon-button"
              type="submit"
              disabled={inputKey.length === 0}
              aria-label="获取内容"
              title="获取内容"
            >
              <Search aria-hidden="true" />
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
        </form>
      ) : null}

      {view.status === 'loading' ? (
        <output className="receive-loading">
          <span className="activity-indicator" aria-hidden="true" />
          <strong>{view.operation.key}</strong>
          <span>获取中</span>
          <button type="button" onClick={returnToInput}>
            返回
          </button>
        </output>
      ) : null}

      {view.status === 'result' && data ? (
        <div className="prepared-content">
          <ContentBlock
            bodyRef={blockRef}
            fileTypeId={data.inspection.fileType.id}
            onOpen={() => setDetailOperationId(view.result.operationId)}
            status="已接收"
            title={blockTitle}
            quickAction={
              isCopyable
                ? {
                    icon: <Copy aria-hidden="true" />,
                    label: '复制正文',
                    onAction: copyBody,
                  }
                : {
                    icon: <Download aria-hidden="true" />,
                    label: `下载 ${data.object.metadata.downloadFilename}`,
                    onAction: downloadBody,
                  }
            }
          />
          <strong className="received-key">{view.result.key}</strong>
          <p className="clipboard-feedback" aria-live="polite">
            {actionMessage}
          </p>
        </div>
      ) : null}

      <DetailDialog
        eyebrow={fileType?.label ?? 'FILE'}
        title={
          data?.object.metadata.serverFilename ??
          (view.status === 'result' ? view.result.key : '内容详情')
        }
        open={detailOpen && view.status === 'result' && Boolean(data)}
        onClose={() => {
          if (deleteState.status === 'deleting') return false
          store.getState().cancelDelete()
          setDetailOperationId(null)
          return true
        }}
        preview={
          data && data.inspection.previewKind !== 'metadata-only' ? (
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
            {data?.inspection.previewKind === 'metadata-only' ? (
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
                <dt>类型</dt>
                <dd>{data.object.metadata.contentType}</dd>
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
            <div className="dialog-actions">
              <button
                ref={confirmDeleteRef}
                className="danger-button"
                type="button"
                onClick={confirmDelete}
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
          <div className="dialog-actions">
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
