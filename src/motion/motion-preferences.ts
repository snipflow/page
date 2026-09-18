export type MotionLevel = 'full' | 'conservative' | 'reduced'

export const ROUTE_MOTION_EASE = {
  background: [0.4, 0, 0.2, 1],
  enter: [0.25, 0.1, 0.25, 1],
  exit: [0.4, 0, 0.6, 1],
} as const

export const MOTION_DURATION = {
  fast: 0.14,
  feedback: 0.2,
  routeBackground: 0.42,
  routeEnter: 0.32,
  routeExit: 0.24,
} as const

interface MotionEnvironment {
  deviceMemory?: number | undefined
  hardwareConcurrency?: number | undefined
  reducedMotion: boolean
}

export function deriveMotionLevel({
  deviceMemory,
  hardwareConcurrency,
  reducedMotion,
}: MotionEnvironment): MotionLevel {
  if (reducedMotion) return 'reduced'
  if (
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 2) ||
    (deviceMemory !== undefined && deviceMemory <= 2)
  ) {
    return 'conservative'
  }
  return 'full'
}
