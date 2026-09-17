import {
  classifyGestureAxis,
  routeGestureProgress,
  routeGestureVisualProgress,
} from './pointer-gesture.ts'

describe('pointer gesture primitives', () => {
  it('waits for movement tolerance before choosing an axis', () => {
    expect(classifyGestureAxis(4, 3)).toBe('pending')
    expect(classifyGestureAxis(20, 4)).toBe('horizontal')
    expect(classifyGestureAxis(4, 20)).toBe('vertical')
  })

  it('uses a viewport-relative route threshold and ignores reverse movement', () => {
    expect(routeGestureProgress(-110, -1, 1_000)).toBe(0.5)
    expect(routeGestureProgress(-220, -1, 1_000)).toBe(1)
    expect(routeGestureProgress(220, -1, 1_000)).toBe(0)
  })

  it('keeps visual progress proportional to the full viewport', () => {
    expect(routeGestureVisualProgress(-220, -1, 1_000)).toBe(0.22)
    expect(routeGestureVisualProgress(-1_000, -1, 1_000)).toBe(1)
    expect(routeGestureVisualProgress(220, -1, 1_000)).toBe(0)
  })
})
