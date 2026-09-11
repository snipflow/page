import { ArrowLeft, Check, Copy, FileText, RotateCcw, Send } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { textByteSize } from '../../domain/index.ts'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { useSendStore, useSendStoreApi, type SendState } from './send-store.ts'
import { useSendFlow } from './use-send-flow.ts'

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

export function SendPage() {
  const state = useSendStore((current) => current)
  const store = useSendStoreApi()
  const { submit } = useSendFlow()
  const [detailOpen, setDetailOpen] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const blockRef = useRef<HTMLButtonElement>(null)
  const text =
    state.draft.content.kind === 'text' ? state.draft.content.text : ''

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

  const sendDisabled = state.phase === 'sending' || state.phase === 'uncertain'
  const canSend = state.phase === 'ready' || state.phase === 'failed'

  return (
    <section className="transfer-page send-page" aria-labelledby="send-title">
      <div className="transfer-page__heading">
        <h1 id="send-title">发送</h1>
      </div>

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
          <button
            className="primary-button transfer-primary"
            type="submit"
            disabled={text.length === 0}
          >
            <Check aria-hidden="true" />
            <span>完成</span>
          </button>
        </form>
      ) : (
        <div className="prepared-content">
          <ContentBlock
            bodyRef={blockRef}
            icon={<FileText />}
            onOpen={() => setDetailOpen(true)}
            status={phaseLabel(state.phase)}
            title="文本块"
            typeLabel="TXT"
            {...(canSend || state.phase === 'sending'
              ? {
                  quickAction: {
                    disabled: sendDisabled,
                    icon: <Send aria-hidden="true" />,
                    label: state.phase === 'sending' ? '正在发送' : '发送文本',
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
                {state.phase !== 'uncertain' ? (
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

      <DetailDialog
        eyebrow="TXT"
        title={state.phase === 'sent' ? state.result.key : '文本详情'}
        open={detailOpen && state.phase !== 'editing'}
        onClose={() => setDetailOpen(false)}
        returnFocusRef={blockRef}
      >
        <pre className="text-preview">{text}</pre>
        <dl className="metadata-list">
          <div>
            <dt>大小</dt>
            <dd>{textByteSize(text)} B</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>text/plain; charset=utf-8</dd>
          </div>
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

        <div className="dialog-actions">
          {state.phase === 'ready' || state.phase === 'failed' ? (
            <button type="button" onClick={sendFromDetail}>
              <Send aria-hidden="true" />
              发送
            </button>
          ) : null}
          {state.phase === 'ready' ||
          state.phase === 'failed' ||
          state.phase === 'conflict' ? (
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
          ) : null}
        </div>
      </DetailDialog>
    </section>
  )
}
