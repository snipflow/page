export type MotionLevel = 'full' | 'conservative' | 'reduced'

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const

export const MOTION_DURATION = {
  fast: 0.14,
  feedback: 0.2,
  route: 1,
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
