import {
  CircleHelp,
  Copy,
  Download,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { isSnipApiError } from '../../api/index.ts'
import { DetailDialog } from '../../components/content-block/DetailDialog.tsx'
import { PreviewSurface } from '../../components/content-block/preview/PreviewSurface.tsx'
import {
  ConfirmationPopover,
  ErrorPopover,
  FeedbackPopoverAnchor,
} from '../../components/feedback/ActionPopover.tsx'
import { isPreviewRenderable, parseMimeType } from '../../domain/index.ts'
import { useSharedNow } from '../../hooks/shared-clock.ts'
import type { CachedSnipIndex } from '../../queries/snip-snapshot.ts'
import { SessionHeader } from '../auth/SessionHeader.tsx'
import { copyTextToClipboard } from '../transfer/clipboard.ts'
import { triggerBlobDownload } from '../transfer/object-url-registry.ts'
import { useObjectUrlRegistry } from '../transfer/use-object-url.ts'
import {
  dashboardClockPrecision,
  deriveDashboardFileType,
  filterDashboardItems,
  formatBytes,
  formatRemainingTime,
  getExpiryState,
  sortDashboardItems,
} from './dashboard-model.ts'
import { useDashboardStore, useDashboardStoreApi } from './dashboard-store.ts'
import { useDashboardFlow } from './use-dashboard-flow.ts'
import { DashboardWaterfall } from './DashboardWaterfall.tsx'

type BodyVerification = {
  key: string
  status: 'failed' | 'loading' | 'ready'
}

function formatSnapshotTime(value: number | null) {
  if (value === null) return '尚未完成'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function formatIndexTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function snapshotFailureMessage(
  failure: 'cancelled' | 'cursor-loop' | 'request-failed' | null,
) {
  if (failure === 'cursor-loop') return '分页游标重复，当前索引不完整。'
  if (failure === 'cancelled') return '索引读取已取消，当前结果可能不完整。'
  return '索引读取失败，已保留可用条目。'
}

function bodyFailureMessage(error: unknown) {
  if (isSnipApiError(error) && error.status === 404) {
    return '正文不存在或已经过期。'
  }
  return '正文读取失败，索引信息仍然可用。'
}

function DashboardSummary({
  stats,
  onRefresh,
}: {
  stats: ReturnType<typeof useDashboardFlow>['stats']
  onRefresh: () => boolean
}) {
  const [helpOpen, setHelpOpen] = useState(false)
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const value = stats?.value
  const storageLimit = value?.storageLimit ?? 0
  const totalSize = value?.totalSize ?? 0

  return (
    <>
      <section className="dashboard-summary" aria-label="存储统计">
        <div className="dashboard-summary__metrics">
          <div>
            <span>对象</span>
            <strong>{value ? value.count.toLocaleString('zh-CN') : '—'}</strong>
          </div>
          <div>
            <span>已用空间</span>
            <strong>{value ? formatBytes(totalSize) : '—'}</strong>
          </div>
          <div>
            <span>存储上限</span>
            <strong>{value ? formatBytes(storageLimit) : '—'}</strong>
          </div>
        </div>
        <progress
          aria-label="存储使用量"
          max={Math.max(storageLimit, 1)}
          value={Math.min(totalSize, Math.max(storageLimit, 1))}
        />
        <div className="dashboard-summary__snapshot">
          <button
            ref={helpTriggerRef}
            className="icon-button dashboard-stats-help"
            type="button"
            aria-label="查看统计快照说明"
            aria-haspopup="dialog"
            title="查看统计快照说明"
            onClick={() => setHelpOpen(true)}
          >
            <CircleHelp aria-hidden="true" />
          </button>
          <span>统计快照：{formatSnapshotTime(stats?.snapshotAt ?? null)}</span>
          {stats?.dirty && stats.refreshState === 'idle' ? (
            <strong>待刷新</strong>
          ) : null}
          {stats?.refreshState === 'loading' ? <strong>刷新中</strong> : null}
          {stats?.refreshState === 'failed' ? (
            <FeedbackPopoverAnchor>
              <ErrorPopover
                actions={[
                  {
                    icon: <RefreshCw aria-hidden="true" />,
                    label: '重新刷新',
                    onSelect: () => {
                      onRefresh()
                    },
                  },
                ]}
                message="统计快照刷新失败，已保留上次可用数据。"
                title="统计刷新失败"
                triggerLabel="查看统计刷新错误"
              />
            </FeedbackPopoverAnchor>
          ) : null}
        </div>
      </section>

      <DetailDialog
        closeLabel="关闭统计快照说明"
        eyebrow="数据时效性"
        onClose={() => setHelpOpen(false)}
        open={helpOpen}
        returnFocusRef={helpTriggerRef}
        title="统计快照仅供参考"
      >
        <p className="dashboard-stats-help__copy">
          统计快照由服务端独立生成。过期对象的清理和统计更新可能存在延迟，因此对象数量和已用空间有时会与下方瀑布流不一致。请仅将统计快照作为容量参考；下方瀑布流展示当前获取到的索引快照。
        </p>
      </DetailDialog>
    </>
  )
}

export function DashboardPage() {
  const searchQuery = useDashboardStore((state) => state.searchQuery)
  const detailKey = useDashboardStore((state) => state.detailKey)
  const dashboardStore = useDashboardStoreApi()
  const objectUrls = useObjectUrlRegistry()
  const {
    body,
    bodyError,
    bodyLoading,
    deleteItem,
    deletePending,
    refresh,
    refreshSnapshot,
    refreshStats,
    requestBody,
    snapshot,
    stats,
  } = useDashboardFlow()
  const sortedItems = useMemo(
    () => sortDashboardItems(snapshot?.items ?? []),
    [snapshot?.items],
  )
  const visibleItems = useMemo(
    () => filterDashboardItems(sortedItems, searchQuery),
    [searchQuery, sortedItems],
  )
  const listTitleRef = useRef<HTMLElement>(null)
  const [selectedFallback, setSelectedFallback] =
    useState<CachedSnipIndex | null>(null)
  const [bodyVerification, setBodyVerification] =
    useState<BodyVerification | null>(null)
  const [deleteState, setDeleteState] = useState<
    'confirming' | 'idle' | 'failed'
  >('idle')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState<{
    message: string
    source: 'body' | 'key'
  } | null>(null)

  const snapshotSelectedItem = detailKey
    ? (snapshot?.items.find((item) => item.key === detailKey) ?? null)
    : null
  const selectedItem =
    snapshotSelectedItem ??
    (selectedFallback?.key === detailKey ? selectedFallback : null)
  const clockItems =
    selectedItem && !visibleItems.some((item) => item.key === selectedItem.key)
      ? [...visibleItems, selectedItem]
      : visibleItems
  const hasExpiringItems = clockItems.some((item) => item.expiresAt !== null)
  const coarseNow = useSharedNow(60_000, hasExpiringItems)
  const precision = dashboardClockPrecision(clockItems, coarseNow)
  const now = useSharedNow(precision, hasExpiringItems)
  const selectedExpiry = selectedItem
    ? getExpiryState(selectedItem.expiresAt, now)
    : { expired: false, remainingMs: null }
  const selectedFileType = selectedItem
    ? deriveDashboardFileType(selectedItem)
    : null
  const verifiedAfterExpiry =
    bodyVerification?.key === detailKey && bodyVerification.status === 'ready'
  const activeBody =
    body && (!selectedExpiry.expired || verifiedAfterExpiry) ? body : null
  const activeFileType =
    activeBody?.inspection.fileType ?? selectedFileType ?? null
  const isCopyable =
    activeBody?.inspection.contentRole === 'inline-text' &&
    activeBody.fullText !== null
  const refreshing =
    snapshot === null ||
    stats === null ||
    snapshot.refreshState === 'loading' ||
    stats.refreshState === 'loading'

  const restoreListFocus = (removedKey?: string) => {
    const state = dashboardStore.getState()
    const sourceKey = removedKey ? null : state.detailKey
    const sourceVisible = visibleItems.some((item) => item.key === sourceKey)
    let focusKey = sourceVisible ? sourceKey : null
    if (!focusKey) {
      const candidates = visibleItems.filter((item) => item.key !== removedKey)
      focusKey =
        candidates[Math.min(state.detailSourceIndex, candidates.length - 1)]
          ?.key ?? null
    }
    const scrollY = state.detailScrollY
    dashboardStore.getState().closeDetail()
    setSelectedFallback(null)
    globalThis.setTimeout(() => {
      if (Math.abs(globalThis.scrollY - scrollY) > 1) {
        globalThis.scrollTo({ top: scrollY })
      }
      const target = focusKey
        ? document
            .querySelector(`[data-key="${focusKey}"]`)
            ?.querySelector<HTMLButtonElement>('.content-block__body')
        : null
      const focusTarget = target ?? listTitleRef.current
      focusTarget?.focus()
    }, 0)
  }

  const loadBody = (item: CachedSnipIndex, force: boolean) => {
    const expired = getExpiryState(item.expiresAt, now).expired
    if (expired || force) {
      setBodyVerification({ key: item.key, status: 'loading' })
    } else {
      setBodyVerification(null)
    }
    void requestBody(item.key, expired || force)
      .then((result) => {
        if (!result || (!expired && !force)) return
        if (dashboardStore.getState().detailKey === item.key) {
          setBodyVerification({ key: item.key, status: 'ready' })
        }
      })
      .catch(() => {
        if (dashboardStore.getState().detailKey === item.key) {
          setBodyVerification({ key: item.key, status: 'failed' })
        }
      })
  }

  const openDetail = (item: CachedSnipIndex, sourceIndex: number) => {
    setSelectedFallback(item)
    setActionMessage('')
    setActionError(null)
    setDeleteState('idle')
    dashboardStore
      .getState()
      .openDetail(item.key, sourceIndex, globalThis.scrollY)
    loadBody(item, false)
  }

  const copyKey = async () => {
    if (!selectedItem) return
    try {
      await copyTextToClipboard(selectedItem.key)
      setActionError(null)
      setActionMessage('Key 已复制')
    } catch {
      setActionMessage('')
      setActionError({
        message: '请手动选择并复制 Key。',
        source: 'key',
      })
    }
  }

  const copyBody = async () => {
    if (!activeBody || activeBody.fullText === null) return
    try {
      await copyTextToClipboard(activeBody.fullText)
      setActionError(null)
      setActionMessage('正文已复制')
    } catch {
      setActionMessage('')
      setActionError({
        message: '请在预览中手动选择并复制正文。',
        source: 'body',
      })
    }
  }

  const downloadBody = () => {
    if (!activeBody) return
    setActionError(null)
    triggerBlobDownload(
      objectUrls,
      activeBody.object.body,
      activeBody.object.metadata.downloadFilename,
    )
    setActionMessage('已开始下载')
  }

  const confirmDelete = async () => {
    if (!selectedItem || deletePending) return
    try {
      const key = selectedItem.key
      const outcome = await deleteItem(key)
      setActionError(null)
      setActionMessage(
        outcome === 'missing' ? `${key} 已不存在` : `${key} 已删除`,
      )
      setDeleteState('idle')
      restoreListFocus(key)
    } catch {
      setDeleteState('failed')
    }
  }

  const indexStatus = snapshot
    ? snapshot.complete
      ? snapshot.refreshState === 'loading'
        ? `正在刷新，继续显示 ${snapshot.items.length} 项完整快照`
        : `完整快照 · ${snapshot.items.length} 项`
      : snapshot.refreshState === 'loading'
        ? `已载入 ${snapshot.items.length} 项，索引继续获取中`
        : `已载入 ${snapshot.items.length} 项，索引不完整`
    : '正在准备索引'

  return (
    <main className="app-page app-page--dashboard" data-page="dashboard">
      <SessionHeader currentPath="/dashboard" />
      <section className="dashboard-page" aria-labelledby="dashboard-title">
        <header className="dashboard-heading">
          <div>
            <p>存储</p>
            <h1 id="dashboard-title">存储概览</h1>
          </div>
          <div className="dashboard-heading__actions">
            <button
              className="icon-button dashboard-refresh"
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-label={refreshing ? '正在刷新存储快照' : '刷新存储快照'}
              title={refreshing ? '正在刷新' : '刷新'}
            >
              <RefreshCw aria-hidden="true" />
            </button>
            {snapshot?.refreshState === 'failed' ? (
              <FeedbackPopoverAnchor>
                <ErrorPopover
                  actions={[
                    {
                      icon: <RefreshCw aria-hidden="true" />,
                      label: '重新刷新',
                      onSelect: () => {
                        refreshSnapshot()
                      },
                    },
                  ]}
                  message={snapshotFailureMessage(snapshot.failure)}
                  title="索引刷新失败"
                  triggerLabel="查看索引刷新错误"
                />
              </FeedbackPopoverAnchor>
            ) : null}
          </div>
        </header>

        <DashboardSummary stats={stats} onRefresh={refreshStats} />

        <div className="dashboard-toolbar">
          <div className="dashboard-search">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="dashboard-search">
              搜索 Key，区分大小写
            </label>
            <input
              id="dashboard-search"
              type="search"
              value={searchQuery}
              onChange={(event) =>
                dashboardStore.getState().setSearchQuery(event.target.value)
              }
              placeholder="搜索 Key"
              autoComplete="off"
            />
            {searchQuery ? (
              <button
                className="icon-button"
                type="button"
                onClick={() => dashboardStore.getState().setSearchQuery('')}
                aria-label="清空搜索"
                title="清空搜索"
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <output className="dashboard-index-state">
            {searchQuery
              ? `匹配 ${visibleItems.length} 项 · ${snapshot?.complete ? '完整索引' : '当前已载入范围'}`
              : indexStatus}
          </output>
        </div>

        <section
          ref={listTitleRef}
          className="dashboard-collection"
          aria-label="Snip 索引"
          tabIndex={-1}
        >
          {snapshot && snapshot.items.length > 0 ? (
            <>
              <DashboardWaterfall
                filterActive={searchQuery.length > 0}
                items={visibleItems}
                now={now}
                onOpen={openDetail}
              />
              {visibleItems.length === 0 ? (
                snapshot.refreshState === 'loading' ? (
                  <output className="dashboard-empty">正在载入索引</output>
                ) : searchQuery ? (
                  <output className="dashboard-empty">
                    当前{snapshot.complete ? '完整索引' : '已载入范围'}
                    没有匹配项
                  </output>
                ) : (
                  <output className="dashboard-empty">尚未取得可用索引</output>
                )
              ) : null}
            </>
          ) : snapshot?.refreshState === 'loading' ? (
            <output className="dashboard-empty">正在载入索引</output>
          ) : snapshot?.complete && snapshot.items.length === 0 ? (
            <output className="dashboard-empty">当前没有 Snip</output>
          ) : searchQuery ? (
            <output className="dashboard-empty">
              当前{snapshot?.complete ? '完整索引' : '已载入范围'}没有匹配项
            </output>
          ) : (
            <output className="dashboard-empty">尚未取得可用索引</output>
          )}
        </section>

        <p className="dashboard-live-feedback" aria-live="polite">
          {detailKey ? '' : actionMessage}
        </p>
      </section>

      <DetailDialog
        eyebrow={activeFileType?.label ?? selectedFileType?.label ?? 'FILE'}
        {...(detailKey ? { motionId: `dashboard-detail-${detailKey}` } : {})}
        title={selectedItem?.filename ?? selectedItem?.key ?? 'Snip 详情'}
        open={Boolean(detailKey && selectedItem)}
        onClose={() => {
          if (deletePending) return false
          if (deleteState === 'confirming') {
            setDeleteState('idle')
            return false
          }
          setDeleteState('idle')
          setBodyVerification(null)
          restoreListFocus()
          return true
        }}
        preview={
          activeBody &&
          isPreviewRenderable(activeBody.inspection.previewKind) ? (
            <PreviewSurface
              blob={activeBody.object.body}
              contentType={activeBody.object.metadata.contentType}
              previewKind={activeBody.inspection.previewKind}
              text={activeBody.previewText}
              truncated={activeBody.previewTruncated}
            />
          ) : null
        }
      >
        {selectedItem ? (
          <>
            <dl className="metadata-list dashboard-detail-metadata">
              <div>
                <dt>Key</dt>
                <dd className="dashboard-detail-key">
                  <span>{selectedItem.key}</span>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={copyKey}
                    aria-label="复制 Key"
                    title="复制 Key"
                  >
                    <Copy aria-hidden="true" />
                  </button>
                </dd>
              </div>
              <div>
                <dt>MIME</dt>
                <dd>
                  {parseMimeType(selectedItem.contentType)?.essence ??
                    selectedItem.contentType}
                </dd>
              </div>
              {selectedItem.filename ? (
                <div>
                  <dt>文件名</dt>
                  <dd>{selectedItem.filename}</dd>
                </div>
              ) : null}
              <div>
                <dt>索引大小</dt>
                <dd>{formatBytes(selectedItem.size)}</dd>
              </div>
              {activeBody &&
              activeBody.object.body.size !== selectedItem.size ? (
                <div>
                  <dt>读取大小</dt>
                  <dd>{formatBytes(activeBody.object.body.size)}</dd>
                </div>
              ) : null}
              <div>
                <dt>创建时间</dt>
                <dd>{formatIndexTime(selectedItem.createdAt)}</dd>
              </div>
              <div>
                <dt>到期时间</dt>
                <dd>
                  {selectedItem.expiresAt
                    ? formatIndexTime(selectedItem.expiresAt)
                    : '永久'}
                </dd>
              </div>
              <div>
                <dt>剩余时间</dt>
                <dd className="dashboard-countdown">
                  {formatRemainingTime(selectedExpiry.remainingMs)}
                </dd>
              </div>
              {selectedItem.source ? (
                <div>
                  <dt>来源</dt>
                  <dd>{selectedItem.source}</dd>
                </div>
              ) : null}
            </dl>

            {bodyLoading || bodyVerification?.status === 'loading' ? (
              <output className="dashboard-detail-state">
                <span className="activity-indicator" aria-hidden="true" />
                正在读取正文
              </output>
            ) : null}
            {selectedExpiry.expired &&
            !verifiedAfterExpiry &&
            bodyVerification?.status !== 'loading' ? (
              <div className="dashboard-expired-state">
                <p>本地时间推算该 Snip 已过期，缓存正文已暂停使用。</p>
                <button
                  type="button"
                  onClick={() => loadBody(selectedItem, true)}
                >
                  <RefreshCw aria-hidden="true" />
                  重新读取
                </button>
              </div>
            ) : null}
            {activeBody &&
            !isPreviewRenderable(activeBody.inspection.previewKind) ? (
              <p className="dashboard-detail-state">
                此类型仅提供文件信息和下载。
              </p>
            ) : null}

            <div className="dialog-actions block-detail-actions">
              {isCopyable ? (
                <button type="button" onClick={copyBody}>
                  <Copy aria-hidden="true" />
                  复制正文
                </button>
              ) : activeBody ? (
                <button type="button" onClick={downloadBody}>
                  <Download aria-hidden="true" />
                  下载
                </button>
              ) : null}
              <ConfirmationPopover
                open={deleteState === 'confirming'}
                onOpenChange={(open) => {
                  if (deletePending) return
                  setDeleteState(open ? 'confirming' : 'idle')
                }}
                title="删除这个对象？"
                description="删除后将无法再次通过当前 Key 获取内容。"
                confirmLabel="删除"
                confirmBusy={deletePending}
                onConfirm={() => {
                  void confirmDelete()
                }}
                trigger={
                  <button
                    className="danger-button"
                    type="button"
                    disabled={deletePending}
                  >
                    <Trash2 aria-hidden="true" />
                    {deletePending ? '删除中' : '删除'}
                  </button>
                }
              />
            </div>
            {(!bodyLoading &&
              (bodyVerification?.status === 'failed' || bodyError)) ||
            actionError ||
            deleteState === 'failed' ? (
              <FeedbackPopoverAnchor>
                {!bodyLoading &&
                (bodyVerification?.status === 'failed' || bodyError) ? (
                  <ErrorPopover
                    actions={[
                      {
                        icon: <RefreshCw aria-hidden="true" />,
                        label: '重新读取',
                        onSelect: () => loadBody(selectedItem, true),
                      },
                    ]}
                    message={bodyFailureMessage(bodyError)}
                    title="正文读取失败"
                    triggerLabel="查看正文读取错误"
                  />
                ) : null}
                {actionError ? (
                  <ErrorPopover
                    message={actionError.message}
                    title={
                      actionError.source === 'key'
                        ? 'Key 复制失败'
                        : '正文复制失败'
                    }
                    triggerLabel="查看复制错误"
                  />
                ) : null}
                {deleteState === 'failed' ? (
                  <ErrorPopover
                    actions={[
                      {
                        label: '关闭提示',
                        onSelect: () => setDeleteState('idle'),
                      },
                    ]}
                    message="索引条目仍然保留，可以稍后重试。"
                    title="删除未完成"
                    triggerLabel="查看删除错误"
                  />
                ) : null}
              </FeedbackPopoverAnchor>
            ) : null}
            <p className="clipboard-feedback" aria-live="polite">
              {actionMessage}
            </p>
          </>
        ) : null}
      </DetailDialog>
    </main>
  )
}
