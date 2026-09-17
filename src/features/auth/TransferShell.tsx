import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  animate,
  m,
  useMotionValue,
  type Transition,
  type Variants,
} from 'motion/react'
import { useCallback, useLayoutEffect, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useMotionPreferences } from '../../motion/motion-context.ts'
import {
  MOTION_DURATION,
  MOTION_EASE,
} from '../../motion/motion-preferences.ts'
import { SessionHeader } from './SessionHeader.tsx'
import { useTransferRouteGesture } from './use-transfer-route-gesture.ts'

const routeVariants: Variants = {
  center: { opacity: 1, x: 0 },
  enter: (direction: number) => ({
    opacity: 1,
    x: `calc(${direction} * var(--motion-route-distance))`,
  }),
}

export function TransferShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const receiving =
    location.pathname === '/receive' ||
    location.pathname.startsWith('/receive/')
  const currentPath = receiving ? '/receive' : '/send'
  const target = receiving ? '/send' : '/receive'
  const targetLabel = receiving ? '前往发送' : '前往接收'
  const mode = receiving ? 'receive' : 'send'
  const { documentVisible, level } = useMotionPreferences()
  const dragOffset = useMotionValue(0)
  const sendBackgroundOpacity = useMotionValue(receiving ? 0 : 1)
  const receiveBackgroundOpacity = useMotionValue(receiving ? 1 : 0)
  const transitionDirection = receiving ? 1 : -1
  const routeTransition = useMemo<Transition>(
    () =>
      level === 'full' && documentVisible
        ? { duration: MOTION_DURATION.route, ease: MOTION_EASE }
        : level === 'conservative' && documentVisible
          ? { duration: MOTION_DURATION.feedback, ease: MOTION_EASE }
          : { duration: 0.01 },
    [documentVisible, level],
  )
  const focusRouteView = useCallback((node: HTMLDivElement | null) => {
    node?.focus({ preventScroll: true })
  }, [])

  const settleGesture = () => {
    const baseTransition: Transition =
      level === 'full'
        ? { type: 'spring', stiffness: 460, damping: 38, mass: 0.8 }
        : { duration: level === 'conservative' ? 0.12 : 0.01 }
    animate(dragOffset, 0, baseTransition)
    animate(sendBackgroundOpacity, receiving ? 0 : 1, baseTransition)
    animate(receiveBackgroundOpacity, receiving ? 1 : 0, baseTransition)
  }

  const navigateToTarget = () => {
    dragOffset.set(0)
    void navigate({ to: target })
  }

  const routeGesture = useTransferRouteGesture({
    expectedDirection: receiving ? 1 : -1,
    onCancel: settleGesture,
    onCommit: navigateToTarget,
    onUpdate: (progress, offset) => {
      if (level === 'full') {
        dragOffset.set(offset)
        sendBackgroundOpacity.set(receiving ? progress : 1 - progress)
        receiveBackgroundOpacity.set(receiving ? 1 - progress : progress)
      }
    },
  })

  useLayoutEffect(() => {
    animate(sendBackgroundOpacity, receiving ? 0 : 1, routeTransition)
    animate(receiveBackgroundOpacity, receiving ? 1 : 0, routeTransition)
    dragOffset.set(0)
  }, [
    dragOffset,
    mode,
    receiveBackgroundOpacity,
    receiving,
    routeTransition,
    sendBackgroundOpacity,
  ])

  return (
    <main
      className="app-page app-page--transfer"
      data-page={mode}
      {...routeGesture}
    >
      <div className="transfer-background" aria-hidden="true">
        <m.div
          className="transfer-background__layer transfer-background__layer--send"
          style={{ opacity: sendBackgroundOpacity }}
        />
        <m.div
          className="transfer-background__layer transfer-background__layer--receive"
          style={{ opacity: receiveBackgroundOpacity }}
        />
      </div>
      <SessionHeader currentPath={currentPath} />
      <m.div className="transfer-route-drag" style={{ x: dragOffset }}>
        <m.div
          key={mode}
          ref={focusRouteView}
          className="transfer-route-view"
          aria-labelledby={receiving ? 'receive-title' : 'send-title'}
          tabIndex={-1}
          custom={transitionDirection}
          variants={routeVariants}
          initial={level === 'full' ? 'enter' : false}
          animate="center"
          transition={routeTransition}
        >
          <Outlet />
        </m.div>
      </m.div>
      <button
        className={`transfer-direction transfer-direction--${receiving ? 'left' : 'right'}`}
        type="button"
        onClick={navigateToTarget}
        aria-label={targetLabel}
        title={targetLabel}
      >
        {receiving ? (
          <ArrowLeft aria-hidden="true" />
        ) : (
          <ArrowRight aria-hidden="true" />
        )}
        <span>{targetLabel}</span>
      </button>
    </main>
  )
}
