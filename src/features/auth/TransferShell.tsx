import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  animate,
  m,
  useMotionValue,
  type AnimationPlaybackControlsWithThen,
  type Transition,
} from 'motion/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  Outlet,
  useBlocker,
  useLocation,
  useNavigate,
  type ShouldBlockFn,
} from '@tanstack/react-router'
import { useMotionPreferences } from '../../motion/motion-context.ts'
import {
  MOTION_DURATION,
  ROUTE_MOTION_EASE,
} from '../../motion/motion-preferences.ts'
import { SessionHeader } from './SessionHeader.tsx'
import { useTransferRouteGesture } from './use-transfer-route-gesture.ts'

type TransferMode = 'receive' | 'send'
type TransitionPhase = 'background' | 'enter' | 'exit' | 'idle'

function transferMode(pathname: string): TransferMode | null {
  if (pathname === '/send') return 'send'
  if (pathname === '/receive' || pathname.startsWith('/receive/')) {
    return 'receive'
  }
  return null
}

function routeDistance() {
  if (typeof globalThis.innerWidth !== 'number') return 48
  return Math.min(72, Math.max(32, globalThis.innerWidth * 0.05))
}

export function TransferShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const receiving = transferMode(location.pathname) === 'receive'
  const currentPath = receiving ? '/receive' : '/send'
  const target = receiving ? '/send' : '/receive'
  const targetLabel = receiving ? '前往发送' : '前往接收'
  const mode: TransferMode = receiving ? 'receive' : 'send'
  const { documentVisible, level } = useMotionPreferences()
  const dragOffset = useMotionValue(0)
  const routeOffset = useMotionValue(0)
  const routeOpacity = useMotionValue(1)
  const sendBackgroundOpacity = useMotionValue(receiving ? 0 : 1)
  const receiveBackgroundOpacity = useMotionValue(receiving ? 1 : 0)
  const routeViewRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const pendingModeRef = useRef<TransferMode | null>(null)
  const sequenceRef = useRef(0)
  const transitioningRef = useRef(false)
  const [phase, setPhase] = useState<TransitionPhase>('idle')
  const routeUnavailable = phase === 'background' || phase === 'exit'

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sequenceRef.current += 1
    }
  }, [])

  const setTransitionPhase = useCallback((nextPhase: TransitionPhase) => {
    transitioningRef.current =
      nextPhase === 'background' || nextPhase === 'exit'
    if (mountedRef.current) setPhase(nextPhase)
  }, [])

  const stopAnimations = (animations: AnimationPlaybackControlsWithThen[]) => {
    for (const animation of animations) animation.stop()
  }

  const shouldBlockRouteTransition = useCallback<ShouldBlockFn>(
    async ({ current, next }) => {
      const currentMode = transferMode(current.pathname)
      const nextMode = transferMode(next.pathname)
      if (
        currentMode === null ||
        nextMode === null ||
        currentMode === nextMode ||
        level !== 'full' ||
        !documentVisible
      ) {
        return false
      }
      if (transitioningRef.current) return true

      const sequence = ++sequenceRef.current
      const direction = nextMode === 'receive' ? 1 : -1
      const distance = routeDistance()
      setTransitionPhase('exit')

      let animations = [
        animate(routeOpacity, 0, {
          duration: MOTION_DURATION.routeExit,
          ease: ROUTE_MOTION_EASE.exit,
        }),
        animate(routeOffset, -direction * distance, {
          duration: MOTION_DURATION.routeExit,
          ease: ROUTE_MOTION_EASE.exit,
        }),
      ]
      await Promise.all(animations)
      if (!mountedRef.current || sequenceRef.current !== sequence) {
        stopAnimations(animations)
        return true
      }

      dragOffset.set(0)
      setTransitionPhase('background')
      animations = [
        animate(sendBackgroundOpacity, nextMode === 'send' ? 1 : 0, {
          duration: MOTION_DURATION.routeBackground,
          ease: ROUTE_MOTION_EASE.background,
        }),
        animate(receiveBackgroundOpacity, nextMode === 'receive' ? 1 : 0, {
          duration: MOTION_DURATION.routeBackground,
          ease: ROUTE_MOTION_EASE.background,
        }),
      ]
      await Promise.all(animations)
      if (!mountedRef.current || sequenceRef.current !== sequence) {
        stopAnimations(animations)
        return true
      }

      routeOffset.set(direction * distance)
      pendingModeRef.current = nextMode
      return false
    },
    [
      documentVisible,
      dragOffset,
      level,
      receiveBackgroundOpacity,
      routeOffset,
      routeOpacity,
      sendBackgroundOpacity,
      setTransitionPhase,
    ],
  )

  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: shouldBlockRouteTransition,
  })

  useLayoutEffect(() => {
    const targetSendOpacity = receiving ? 0 : 1
    const targetReceiveOpacity = receiving ? 1 : 0
    const pendingMode = pendingModeRef.current

    if (pendingMode !== mode) {
      sendBackgroundOpacity.set(targetSendOpacity)
      receiveBackgroundOpacity.set(targetReceiveOpacity)
      routeOffset.set(0)
      routeOpacity.set(1)
      setTransitionPhase('idle')
      routeViewRef.current?.focus({ preventScroll: true })
      return
    }

    pendingModeRef.current = null
    setTransitionPhase('enter')
    const sequence = sequenceRef.current
    const animations = [
      animate(routeOpacity, 1, {
        duration: MOTION_DURATION.routeEnter,
        ease: ROUTE_MOTION_EASE.enter,
      }),
      animate(routeOffset, 0, {
        duration: MOTION_DURATION.routeEnter,
        ease: ROUTE_MOTION_EASE.enter,
      }),
    ]
    void Promise.all(animations).then(() => {
      if (!mountedRef.current || sequenceRef.current !== sequence) return
      setTransitionPhase('idle')
      routeViewRef.current?.focus({ preventScroll: true })
    })

    return () => stopAnimations(animations)
  }, [
    mode,
    receiveBackgroundOpacity,
    receiving,
    routeOffset,
    routeOpacity,
    sendBackgroundOpacity,
    setTransitionPhase,
  ])

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
    if (transitioningRef.current) return
    void navigate({ to: target })
  }

  const routeGesture = useTransferRouteGesture({
    expectedDirection: receiving ? 1 : -1,
    onCancel: () => {
      if (!transitioningRef.current) settleGesture()
    },
    onCommit: navigateToTarget,
    onUpdate: (progress, offset) => {
      if (level === 'full' && !transitioningRef.current) {
        dragOffset.set(offset)
        sendBackgroundOpacity.set(receiving ? progress : 1 - progress)
        receiveBackgroundOpacity.set(receiving ? 1 - progress : progress)
      }
    },
  })

  return (
    <main
      className="app-page app-page--transfer"
      data-page={mode}
      data-transition-phase={phase}
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
          ref={routeViewRef}
          className="transfer-route-view"
          aria-labelledby={receiving ? 'receive-title' : 'send-title'}
          aria-busy={phase !== 'idle'}
          inert={routeUnavailable}
          tabIndex={-1}
          style={{ opacity: routeOpacity, x: routeOffset }}
        >
          <Outlet />
        </m.div>
      </m.div>
      <button
        className={`transfer-direction transfer-direction--${receiving ? 'left' : 'right'}`}
        type="button"
        onClick={navigateToTarget}
        disabled={routeUnavailable}
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
