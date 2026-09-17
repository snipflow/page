import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import {
  classifyGestureAxis,
  routeGestureProgress,
  routeGestureVisualProgress,
  type GestureAxis,
} from '../../hooks/pointer-gesture.ts'

interface TransferRouteGestureOptions {
  expectedDirection: -1 | 1
  onCancel: () => void
  onCommit: () => void
  onUpdate: (progress: number, offset: number) => void
}

interface ActiveRouteGesture {
  axis: GestureAxis
  committed: boolean
  moved: boolean
  pointerId: number
  viewportWidth: number
  x: number
  y: number
}

const EXCLUDED_TARGETS = [
  'a',
  'article',
  'button',
  'form',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[data-route-gesture-exclude]',
  '[role="dialog"]',
].join(',')

function canStartRouteGesture(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-route-gesture-allow-interactive]')) return true
  if (target.closest(EXCLUDED_TARGETS)) return false
  return Boolean(target.closest('[data-route-gesture-surface]'))
}

export function useTransferRouteGesture({
  expectedDirection,
  onCancel,
  onCommit,
  onUpdate,
}: TransferRouteGestureOptions) {
  const active = useRef<ActiveRouteGesture | null>(null)
  const suppressClick = useRef(false)
  const suppressReset = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (suppressReset.current !== null) {
        globalThis.clearTimeout(suppressReset.current)
      }
    },
    [],
  )

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      (event.isPrimary === false && Boolean(event.pointerType)) ||
      !canStartRouteGesture(event.target)
    ) {
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const viewportWidth = bounds.width || globalThis.innerWidth || 1
    const relativeX = event.clientX - bounds.left
    const protectedEdge = viewportWidth * 0.05
    if (
      relativeX <= protectedEdge ||
      relativeX >= viewportWidth - protectedEdge
    ) {
      return
    }
    active.current = {
      axis: 'pending',
      committed: false,
      moved: false,
      pointerId: event.pointerId,
      viewportWidth,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = active.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gesture.x
    const deltaY = event.clientY - gesture.y
    if (gesture.axis === 'pending') {
      gesture.axis = classifyGestureAxis(deltaX, deltaY)
      if (gesture.axis === 'vertical') {
        active.current = null
        onCancel()
        return
      }
      if (gesture.axis === 'pending') return
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    event.preventDefault()
    gesture.moved = true
    const maxOffset = gesture.viewportWidth * 0.085
    const directionalOffset = Math.max(0, deltaX * expectedDirection)
    onUpdate(
      routeGestureVisualProgress(
        deltaX,
        expectedDirection,
        gesture.viewportWidth,
      ),
      expectedDirection * Math.min(directionalOffset, maxOffset),
    )
  }

  const finish = (event: PointerEvent<HTMLElement>, canceled = false) => {
    const gesture = active.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gesture.x
    const progress = routeGestureProgress(
      deltaX,
      expectedDirection,
      gesture.viewportWidth,
    )
    active.current = null
    if (gesture.moved) {
      suppressClick.current = true
      suppressReset.current = globalThis.setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
    if (!canceled && gesture.axis === 'horizontal' && progress >= 1) {
      if (!gesture.committed) {
        gesture.committed = true
        onCommit()
      }
      return
    }
    onCancel()
  }

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    onClickCapture,
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event),
  }
}
