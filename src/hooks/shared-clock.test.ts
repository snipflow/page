import { SharedClock } from './shared-clock.ts'

class TestVisibilityTarget {
  hidden = false
  listener: (() => void) | null = null

  addEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listener = listener
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void) {
    if (this.listener === listener) this.listener = null
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden
    this.listener?.()
  }
}

describe('SharedClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => vi.useRealTimers())

  it('uses one timer while honoring each subscriber precision', () => {
    const clock = new SharedClock({ now: Date.now, visibilityTarget: null })
    const frequent = vi.fn<() => void>()
    const minute = vi.fn<() => void>()
    const unsubscribeFrequent = clock.subscribe(frequent, 1_000)
    const unsubscribeMinute = clock.subscribe(minute, 60_000)

    vi.advanceTimersByTime(1_000)
    expect(frequent).toHaveBeenCalledOnce()
    expect(minute).not.toHaveBeenCalled()
    vi.advanceTimersByTime(59_000)
    expect(frequent).toHaveBeenCalledTimes(60)
    expect(minute).toHaveBeenCalledOnce()

    unsubscribeFrequent()
    unsubscribeMinute()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses in the background and recomputes from wall time on return', () => {
    const visibility = new TestVisibilityTarget()
    const clock = new SharedClock({
      now: Date.now,
      visibilityTarget: visibility,
    })
    const listener = vi.fn<() => void>()
    const unsubscribe = clock.subscribe(listener, 1_000)

    visibility.setHidden(true)
    vi.advanceTimersByTime(10_000)
    expect(listener).not.toHaveBeenCalled()
    visibility.setHidden(false)
    expect(listener).toHaveBeenCalledOnce()
    expect(clock.getSnapshot()).toBe(10_000)

    unsubscribe()
    expect(visibility.listener).toBeNull()
  })
})
