import { useCallback, useSyncExternalStore } from 'react'

type ClockListener = () => void

interface VisibilityTarget {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface SharedClockOptions {
  now?: () => number
  visibilityTarget?: VisibilityTarget | null
}

export class SharedClock {
  private current: number
  private readonly listeners = new Map<
    ClockListener,
    { precisionMs: number; lastNotifiedAt: number }
  >()
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeningForVisibility = false
  private readonly now: () => number
  private readonly visibilityTarget: VisibilityTarget | null

  constructor({
    now = Date.now,
    visibilityTarget = typeof document === 'undefined' ? null : document,
  }: SharedClockOptions = {}) {
    this.now = now
    this.current = now()
    this.visibilityTarget = visibilityTarget
  }

  getSnapshot = () => this.current

  subscribe(listener: ClockListener, precisionMs: number) {
    const normalizedPrecision = Math.max(1_000, Math.floor(precisionMs))
    this.current = this.now()
    this.listeners.set(listener, {
      precisionMs: normalizedPrecision,
      lastNotifiedAt: this.current,
    })
    this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
      else this.schedule()
    }
  }

  private readonly handleVisibilityChange = () => {
    if (this.visibilityTarget?.hidden) {
      this.clearTimer()
      return
    }
    this.current = this.now()
    for (const [listener, state] of this.listeners) {
      state.lastNotifiedAt = this.current
      listener()
    }
    this.schedule()
  }

  private start() {
    if (!this.listeningForVisibility && this.visibilityTarget) {
      this.visibilityTarget.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange,
      )
      this.listeningForVisibility = true
    }
    this.schedule()
  }

  private stop() {
    this.clearTimer()
    if (this.listeningForVisibility && this.visibilityTarget) {
      this.visibilityTarget.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange,
      )
      this.listeningForVisibility = false
    }
  }

  private schedule() {
    this.clearTimer()
    if (this.listeners.size === 0 || this.visibilityTarget?.hidden) return
    const precisionMs = Math.min(
      ...Array.from(this.listeners.values(), (state) => state.precisionMs),
    )
    this.timer = setTimeout(() => this.tick(), precisionMs)
  }

  private tick() {
    this.timer = null
    this.current = this.now()
    for (const [listener, state] of this.listeners) {
      if (this.current - state.lastNotifiedAt < state.precisionMs) continue
      state.lastNotifiedAt = this.current
      listener()
    }
    this.schedule()
  }

  private clearTimer() {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}

const appClock = new SharedClock()

export function useSharedNow(precisionMs = 60_000, enabled = true) {
  const subscribe = useCallback(
    (listener: ClockListener) =>
      enabled ? appClock.subscribe(listener, precisionMs) : () => undefined,
    [enabled, precisionMs],
  )
  return useSyncExternalStore(
    subscribe,
    appClock.getSnapshot,
    appClock.getSnapshot,
  )
}
