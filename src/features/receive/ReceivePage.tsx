import { Copy, FileText, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { useReceiveStore, useReceiveStoreApi } from './receive-store.ts'
import { useReceiveFlow } from './use-receive-flow.ts'

export function ReceivePage() {
  const inputKey = useReceiveStore((state) => state.inputKey)
  const view = useReceiveStore((state) => state.view)
  const deleteState = useReceiveStore((state) => state.deleteState)
  const store = useReceiveStoreApi()
  const { confirmDelete, data, returnToInput, submit } = useReceiveFlow()
  const [detailOperationId, setDetailOperationId] = useState<string | null>(
    null,
  )
  const [copyMessage, setCopyMessage] = useState('')
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
    setCopyMessage('')
    submit()
  }

  const copyBody = async () => {
    if (!data) return
    try {
      await copyTextToClipboard(data.text)
      setCopyMessage('正文已复制')
    } catch {
      setCopyMessage('复制失败，请在详情中选择正文')
      if (view.status === 'result') {
        setDetailOperationId(view.result.operationId)
      }
    }
  }

  const showInput = view.status === 'input' || view.status === 'error'

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
            icon={<FileText />}
            onOpen={() => setDetailOperationId(view.result.operationId)}
            status="已接收"
            title="接收的文本块"
            typeLabel="TXT"
            quickAction={{
              icon: <Copy aria-hidden="true" />,
              label: '复制正文',
              onAction: copyBody,
            }}
          />
          <strong className="received-key">{view.result.key}</strong>
          <p className="clipboard-feedback" aria-live="polite">
            {copyMessage}
          </p>
        </div>
      ) : null}

      <DetailDialog
        eyebrow="TXT"
        title={view.status === 'result' ? view.result.key : '文本详情'}
        open={detailOpen && view.status === 'result' && Boolean(data)}
        onClose={() => {
          if (deleteState.status === 'deleting') return false
          store.getState().cancelDelete()
          setDetailOperationId(null)
          return true
        }}
        returnFocusRef={blockRef}
      >
        {data ? (
          <>
            <pre className="text-preview">{data.text}</pre>
            <dl className="metadata-list">
              <div>
                <dt>大小</dt>
                <dd>{data.object.body.size} B</dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd>{data.object.metadata.contentType}</dd>
              </div>
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
            <button type="button" onClick={copyBody}>
              <Copy aria-hidden="true" />
              复制正文
            </button>
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
