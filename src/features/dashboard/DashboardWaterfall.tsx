import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  m,
  useIsPresent,
  type MotionStyle,
} from 'motion/react'
import { ContentBlock } from '../../components/content-block/ContentBlock.tsx'
import { useMotionPreferences } from '../../motion/motion-context.ts'
import {
  MOTION_DURATION,
  WATERFALL_MOTION_EASE,
} from '../../motion/motion-preferences.ts'
import type { CachedSnipIndex } from '../../queries/snip-snapshot.ts'
import {
  dashboardBlockSpan,
  deriveDashboardFileType,
  getExpiryState,
} from './dashboard-model.ts'

const FALLBACK_VIEWPORT_HEIGHT = 800
const MAX_STAGGER_DELAY = 0.72

function getEntranceDelay(order: number, batchSize: number) {
  if (batchSize <= 1) return 0
  const interval = Math.min(
    MOTION_DURATION.waterfallStagger,
    MAX_STAGGER_DELAY / (batchSize - 1),
  )
  return order * interval
}

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
  filterActive: boolean
  items: CachedSnipIndex[]
  now: number
  onOpen: (item: CachedSnipIndex, sourceIndex: number) => void
}

interface DashboardWaterfallItemProps {
  entranceDelay: number
  fullMotion: boolean
  item: CachedSnipIndex
  layoutDependency: string
  motionEnabled: boolean
  now: number
  onOpen: (item: CachedSnipIndex, sourceIndex: number) => void
  sourceIndex: number
}

type DashboardWaterfallItemStyle = MotionStyle & {
  '--dashboard-block-span': number
}

const DashboardWaterfallItem = forwardRef<
  HTMLLIElement,
  DashboardWaterfallItemProps
>(function DashboardWaterfallItem(
  {
    entranceDelay,
    fullMotion,
    item,
    layoutDependency,
    motionEnabled,
    now,
    onOpen,
    sourceIndex,
  },
  forwardedRef,
) {
  const isPresent = useIsPresent()
  const fileType = deriveDashboardFileType(item)
  const expiry = getExpiryState(item.expiresAt, now)
  const enterDuration = fullMotion
    ? MOTION_DURATION.waterfallEnter
    : MOTION_DURATION.fast

  return (
    <m.li
      ref={forwardedRef}
      className="dashboard-flow__item"
      data-expired={expiry.expired || undefined}
      data-key={item.key}
      data-motion-presence={isPresent ? 'present' : 'exiting'}
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      layout={fullMotion ? 'position' : false}
      layoutDependency={layoutDependency}
      initial={
        motionEnabled
          ? {
              opacity: 0,
              scale: fullMotion ? 0.72 : 1,
            }
          : false
      }
      animate={{
        opacity: 1,
        scale: 1,
        transition: {
          delay: entranceDelay,
          duration: motionEnabled ? enterDuration : 0,
          ease: WATERFALL_MOTION_EASE,
        },
      }}
      {...(motionEnabled
        ? {
            exit: {
              opacity: 0,
              scale: fullMotion ? 0.72 : 1,
              transition: {
                duration: fullMotion
                  ? MOTION_DURATION.waterfallExit
                  : MOTION_DURATION.fast,
                ease: WATERFALL_MOTION_EASE,
              },
            },
          }
        : {})}
      transition={{
        layout: {
          delay: fullMotion ? MOTION_DURATION.waterfallLayoutDelay : 0,
          duration: fullMotion ? MOTION_DURATION.waterfallLayout : 0,
          ease: WATERFALL_MOTION_EASE,
        },
      }}
      style={
        {
          '--dashboard-block-span': dashboardBlockSpan(item),
        } as DashboardWaterfallItemStyle
      }
    >
      <ContentBlock
        fileTypeId={fileType.id}
        motionId={`dashboard-detail-${item.key}`}
        onOpen={() => {
          if (isPresent) onOpen(item, sourceIndex)
        }}
        status={item.key}
        title={item.filename ?? item.key}
      />
    </m.li>
  )
})

export function DashboardWaterfall({
  filterActive,
  items,
  now,
  onOpen,
}: DashboardWaterfallProps) {
  const flowRef = useRef<HTMLUListElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState(readViewportHeight)
  const [revealedScreens, setRevealedScreens] = useState(1)
  const [unfilteredVisibleCount, setUnfilteredVisibleCount] = useState(() =>
    Math.min(items.length, 1),
  )
  const [filteredVisibleCount, setFilteredVisibleCount] = useState(() =>
    Math.min(items.length, 1),
  )
  const [canRevealMore, setCanRevealMore] = useState(false)
  const { documentVisible, level } = useMotionPreferences()
  const motionLevel = documentVisible ? level : 'reduced'
  const motionEnabled = motionLevel !== 'reduced'
  const fullMotion = motionLevel === 'full'

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(readViewportHeight())
    globalThis.addEventListener('resize', updateViewportHeight)
    return () => globalThis.removeEventListener('resize', updateViewportHeight)
  }, [])

  const visibleCount = filterActive
    ? Math.max(unfilteredVisibleCount, filteredVisibleCount)
    : unfilteredVisibleCount

  useLayoutEffect(() => {
    return scheduleLayoutMeasurement(() => {
      const setActiveVisibleCount = filterActive
        ? setFilteredVisibleCount
        : setUnfilteredVisibleCount

      if (items.length === 0) {
        if (!filterActive) setUnfilteredVisibleCount(0)
        setCanRevealMore(false)
        return
      }
      if (visibleCount === 0) {
        setActiveVisibleCount(1)
        setCanRevealMore(false)
        return
      }
      if (visibleCount > items.length) {
        if (!filterActive) setUnfilteredVisibleCount(items.length)
        setCanRevealMore(false)
        return
      }

      const flowHeight = flowRef.current?.getBoundingClientRect().height ?? 0
      if (flowHeight <= 0) {
        setActiveVisibleCount(items.length)
        setCanRevealMore(false)
        return
      }

      const targetHeight = revealedScreens * viewportHeight
      if (flowHeight + 1 < targetHeight && visibleCount < items.length) {
        const estimatedCount = Math.ceil(
          (visibleCount * targetHeight) / flowHeight,
        )
        setActiveVisibleCount(
          Math.min(items.length, Math.max(visibleCount + 1, estimatedCount)),
        )
        setCanRevealMore(false)
        return
      }
      const hasMoreScreens = visibleCount < items.length
      setCanRevealMore(hasMoreScreens)
    })
  }, [filterActive, items, revealedScreens, viewportHeight, visibleCount])

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
  const layoutDependency = renderedItems.map((item) => item.key).join('\u0000')
  const hasMore = renderedItems.length < items.length
  const revealStatus = hasMore
    ? `已显示 ${renderedItems.length} 项，共 ${items.length} 项`
    : `已显示全部 ${items.length} 项`

  return (
    <>
      <ul
        ref={flowRef}
        className="dashboard-flow"
        data-motion-level={motionLevel}
        aria-busy={hasMore && !canRevealMore}
      >
        <AnimatePresence initial={motionEnabled} mode="popLayout">
          {renderedItems.map((item, index) => (
            <DashboardWaterfallItem
              key={item.key}
              entranceDelay={
                fullMotion ? getEntranceDelay(index, renderedItems.length) : 0
              }
              fullMotion={fullMotion}
              item={item}
              layoutDependency={layoutDependency}
              motionEnabled={motionEnabled}
              now={now}
              onOpen={onOpen}
              sourceIndex={index}
            />
          ))}
        </AnimatePresence>
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
