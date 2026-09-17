import { useEffect, useRef, type PointerEvent } from 'react'
import { POINTER_GESTURE } from './pointer-gesture.ts'

interface PressGestureOptions {
  onLongPress: () => void
}

interface ActivePress {
  longPressed: boolean
  moved: boolean
  timer: number | null
  x: number
  y: number
}

export function usePressGesture({ onLongPress }: PressGestureOptions) {
  const activePress = useRef<ActivePress | null>(null)
  const onLongPressRef = useRef(onLongPress)

  useEffect(() => {
    onLongPressRef.current = onLongPress
  }, [onLongPress])

  const clearTimer = () => {
    const current = activePress.current
    if (current?.timer !== null && current?.timer !== undefined) {
      globalThis.clearTimeout(current.timer)
      current.timer = null
    }
  }

  useEffect(() => clearTimer, [])

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      (event.isPrimary === false && Boolean(event.pointerType))
    ) {
      return
    }
    clearTimer()
    activePress.current = {
      longPressed: false,
      moved: false,
      timer: globalThis.setTimeout(() => {
        const current = activePress.current
        if (!current || current.moved) return
        current.longPressed = true
        onLongPressRef.current()
      }, POINTER_GESTURE.longPressMs),
      x: event.clientX,
      y: event.clientY,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = activePress.current
    if (!current) return
    if (
      Math.hypot(event.clientX - current.x, event.clientY - current.y) >
      POINTER_GESTURE.moveTolerance
    ) {
      current.moved = true
      clearTimer()
    }
  }

  const onPointerEnd = () => clearTimer()

  const consumeSuppressedClick = () => {
    const suppressed = Boolean(
      activePress.current?.moved || activePress.current?.longPressed,
    )
    activePress.current = null
    return suppressed
  }

  return {
    consumeSuppressedClick,
    pointerHandlers: {
      onPointerCancel: onPointerEnd,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
    },
  }
}
