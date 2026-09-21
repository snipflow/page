export type MotionLevel = 'full' | 'conservative' | 'reduced'

export const ROUTE_MOTION_EASE = {
  background: [0.4, 0, 0.2, 1],
  enter: [0.25, 0.1, 0.25, 1],
  exit: [0.4, 0, 0.6, 1],
} as const

export const DETAIL_MOTION_EASE = [0.22, 1, 0.36, 1] as const
export const DETAIL_PREVIEW_EASE = [0.4, 0, 0.2, 1] as const
export const WATERFALL_MOTION_EASE = [0.4, 0, 0.2, 1] as const
export const SEND_COMPOSER_EASE = [0.4, 0, 0.2, 1] as const

export const MOTION_DURATION = {
  detailBackdrop: 0.2,
  detailContent: 0.2,
  detailExpand: 0.46,
  detailPreview: 0.72,
  detailPreviewDelay: 0.14,
  fast: 0.14,
  contentBlockReveal: 0.92,
  feedback: 0.2,
  routeBackground: 0.42,
  routeEnter: 0.32,
  routeExit: 0.24,
  sendComposer: 0.68,
  sendComposerContent: 0.28,
  sendAction: 0.24,
  waterfallEnter: 0.52,
  waterfallExit: 0.4,
  waterfallLayout: 0.68,
  waterfallLayoutDelay: 0.12,
  waterfallStagger: 0.1,
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
