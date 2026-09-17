export const POINTER_GESTURE = {
  directionConfidence: 1.2,
  longPressMs: 520,
  moveTolerance: 8,
  routeThresholdRatio: 0.22,
} as const

export type GestureAxis = 'horizontal' | 'pending' | 'vertical'

export function classifyGestureAxis(
  deltaX: number,
  deltaY: number,
): GestureAxis {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  if (
    Math.hypot(horizontalDistance, verticalDistance) <
    POINTER_GESTURE.moveTolerance
  ) {
    return 'pending'
  }
  if (
    horizontalDistance >=
    verticalDistance * POINTER_GESTURE.directionConfidence
  ) {
    return 'horizontal'
  }
  if (
    verticalDistance >=
    horizontalDistance * POINTER_GESTURE.directionConfidence
  ) {
    return 'vertical'
  }
  return 'pending'
}

export function routeGestureProgress(
  deltaX: number,
  expectedDirection: -1 | 1,
  viewportWidth: number,
) {
  const directionalDistance = Math.max(0, deltaX * expectedDirection)
  const threshold = Math.max(
    1,
    viewportWidth * POINTER_GESTURE.routeThresholdRatio,
  )
  return Math.min(1, directionalDistance / threshold)
}

export function routeGestureVisualProgress(
  deltaX: number,
  expectedDirection: -1 | 1,
  viewportWidth: number,
) {
  const directionalDistance = Math.max(0, deltaX * expectedDirection)
  return Math.min(1, directionalDistance / Math.max(1, viewportWidth))
}
