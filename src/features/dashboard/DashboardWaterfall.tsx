import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import type { CachedSnipIndex } from '../../queries/snip-snapshot.ts'
import {
  dashboardBlockSpan,
  deriveDashboardFileType,
  getExpiryState,
} from './dashboard-model.ts'

const FALLBACK_VIEWPORT_HEIGHT = 800

function readViewportHeight() {
  if (typeof globalThis.innerHeight !== 'number') {
    return FALLBACK_VIEWPORT_HEIGHT
  }
  return Math.max(globalThis.innerHeight, 1)
}

function scheduleLayoutMeasurement(callback: () => void) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    const frame = globalThis.requestAnimationFrame(callback)
    return () => globalThis.cancelAnimationFrame(frame)
  }
  const timer = globalThis.setTimeout(callback, 0)
  return () => globalThis.clearTimeout(timer)
}

interface DashboardWaterfallProps {
  items: CachedSnipIndex[]
  now: number
  onOpen: (item: CachedSnipIndex, sourceIndex: number) => void
}

export function DashboardWaterfall({
  items,
  now,
  onOpen,
}: DashboardWaterfallProps) {
  const flowRef = useRef<HTMLUListElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState(readViewportHeight)
  const [revealedScreens, setRevealedScreens] = useState(1)
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(items.length, 1),
  )
  const [canRevealMore, setCanRevealMore] = useState(false)

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(readViewportHeight())
    globalThis.addEventListener('resize', updateViewportHeight)
    return () => globalThis.removeEventListener('resize', updateViewportHeight)
  }, [])

  useLayoutEffect(() => {
    return scheduleLayoutMeasurement(() => {
      if (items.length === 0) {
        setVisibleCount(0)
        setCanRevealMore(false)
        return
      }
      if (visibleCount === 0) {
        setVisibleCount(1)
        setCanRevealMore(false)
        return
      }
      if (visibleCount > items.length) {
        setVisibleCount(items.length)
        setCanRevealMore(false)
        return
      }

      const flowHeight = flowRef.current?.getBoundingClientRect().height ?? 0
      if (flowHeight <= 0) {
        setVisibleCount(items.length)
        setCanRevealMore(false)
        return
      }

      const targetHeight = revealedScreens * viewportHeight
      if (flowHeight + 1 < targetHeight && visibleCount < items.length) {
        const estimatedCount = Math.ceil(
          (visibleCount * targetHeight) / flowHeight,
        )
        setVisibleCount(
          Math.min(items.length, Math.max(visibleCount + 1, estimatedCount)),
        )
        setCanRevealMore(false)
        return
      }
      setCanRevealMore(visibleCount < items.length)
    })
  }, [items, revealedScreens, viewportHeight, visibleCount])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!canRevealMore || !sentinel) return

    let consumed = false
    const revealNextScreen = () => {
      if (consumed) return
      consumed = true
      setCanRevealMore(false)
      setRevealedScreens((current) => current + 1)
    }

    if (typeof globalThis.IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            revealNextScreen()
          }
        },
        { rootMargin: '0px 0px 1px 0px' },
      )
      observer.observe(sentinel)
      return () => observer.disconnect()
    }

    const checkScrollPosition = () => {
      if (sentinel.getBoundingClientRect().top <= readViewportHeight() + 1) {
        revealNextScreen()
      }
    }
    globalThis.addEventListener('scroll', checkScrollPosition, {
      passive: true,
    })
    checkScrollPosition()
    return () => globalThis.removeEventListener('scroll', checkScrollPosition)
  }, [canRevealMore])

  const renderedItems = items.slice(0, visibleCount)
  const hasMore = renderedItems.length < items.length
  const revealStatus = hasMore
    ? `已显示 ${renderedItems.length} 项，共 ${items.length} 项`
    : `已显示全部 ${items.length} 项`

  return (
    <>
      <ul
        ref={flowRef}
        className="dashboard-flow"
        aria-busy={hasMore && !canRevealMore}
      >
        {renderedItems.map((item, index) => {
          const fileType = deriveDashboardFileType(item)
          const expiry = getExpiryState(item.expiresAt, now)
          return (
            <li
              key={item.key}
              className="dashboard-flow__item"
              data-expired={expiry.expired || undefined}
              data-key={item.key}
              style={
                {
                  '--dashboard-block-span': dashboardBlockSpan(item),
                } as CSSProperties
              }
            >
              <ContentBlock
                fileTypeId={fileType.id}
                motionId={`dashboard-detail-${item.key}`}
                onOpen={() => onOpen(item, index)}
                status={item.key}
                title={item.filename ?? item.key}
              />
            </li>
          )
        })}
      </ul>
      <output className="dashboard-reveal-status sr-only" aria-live="polite">
        {canRevealMore || !hasMore ? revealStatus : ''}
      </output>
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="dashboard-flow-sentinel"
          aria-hidden="true"
        />
      ) : null}
    </>
  )
}
