import { deriveMotionLevel } from './motion-preferences.ts'

describe('deriveMotionLevel', () => {
  it('honors the user reduced-motion preference first', () => {
    expect(
      deriveMotionLevel({
        deviceMemory: 16,
        hardwareConcurrency: 12,
        reducedMotion: true,
      }),
    ).toBe('reduced')
  })

  it.each([
    { deviceMemory: 2, hardwareConcurrency: 8 },
    { deviceMemory: 8, hardwareConcurrency: 2 },
  ])('uses conservative motion on constrained devices', (environment) => {
    expect(deriveMotionLevel({ ...environment, reducedMotion: false })).toBe(
      'conservative',
    )
  })

  it('uses full motion when no constraint is present', () => {
    expect(
      deriveMotionLevel({
        deviceMemory: 8,
        hardwareConcurrency: 8,
        reducedMotion: false,
      }),
    ).toBe('full')
  })
})
