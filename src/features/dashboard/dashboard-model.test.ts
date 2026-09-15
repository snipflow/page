import { describe, expect, it } from 'vitest'
import type { CachedSnipIndex } from '../../queries/snip-snapshot.ts'
import {
  dashboardBlockSpan,
  dashboardClockPrecision,
  filterDashboardItems,
  formatBytes,
  formatRemainingTime,
  getExpiryState,
  sortDashboardItems,
} from './dashboard-model.ts'

const items: CachedSnipIndex[] = [
  {
    key: 'beta-Key',
    contentType: 'application/json',
    size: 1_024,
    createdAt: '2026-09-14T00:00:00.000Z',
    expiresAt: null,
  },
  {
    key: 'Alpha-key',
    contentType: 'image/png',
    filename: 'image.png',
    size: 2_048,
    createdAt: '2026-09-15T00:00:00.000Z',
    expiresAt: '2026-09-15T00:01:00.000Z',
  },
  {
    key: 'alpha-key',
    contentType: 'text/plain',
    size: 3,
    createdAt: '2026-09-15T00:00:00.000Z',
    expiresAt: '2026-09-15T02:00:00.000Z',
  },
]

describe('dashboard model', () => {
  it('sorts newest first with a deterministic key tie-breaker', () => {
    expect(sortDashboardItems(items).map((item) => item.key)).toEqual([
      'Alpha-key',
      'alpha-key',
      'beta-Key',
    ])
    expect(items.map((item) => item.key)).toEqual([
      'beta-Key',
      'Alpha-key',
      'alpha-key',
    ])
  })

  it('performs a case-sensitive local key substring search', () => {
    expect(
      filterDashboardItems(items, 'Alpha').map((item) => item.key),
    ).toEqual(['Alpha-key'])
    expect(
      filterDashboardItems(items, 'alpha').map((item) => item.key),
    ).toEqual(['alpha-key'])
    expect(filterDashboardItems(items, '')).toEqual(items)
  })

  it('uses semantic and stable block proportions', () => {
    expect(dashboardBlockSpan(items[0]!)).toBe(34)
    expect(dashboardBlockSpan(items[1]!)).toBe(42)
    expect(dashboardBlockSpan(items[1]!)).toBe(
      dashboardBlockSpan({ ...items[1]! }),
    )
  })

  it('derives expiry directly from the supplied wall clock', () => {
    const before = Date.parse('2026-09-15T00:00:30.000Z')
    expect(getExpiryState(items[1]!.expiresAt, before)).toEqual({
      expired: false,
      remainingMs: 30_000,
    })
    expect(
      getExpiryState(
        items[1]!.expiresAt,
        Date.parse('2026-09-15T00:01:01.000Z'),
      ),
    ).toEqual({ expired: true, remainingMs: 0 })
    expect(getExpiryState(null, before)).toEqual({
      expired: false,
      remainingMs: null,
    })
  })

  it('keeps remaining-time and byte labels compact', () => {
    expect(formatRemainingTime(null)).toBe('永久')
    expect(formatRemainingTime(0)).toBe('已过期')
    expect(formatRemainingTime(59_001)).toBe('60 秒')
    expect(formatRemainingTime(60_001)).toBe('2 分钟')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1_024)).toBe('1.0 KiB')
    expect(formatBytes(1_048_576)).toBe('1.0 MiB')
  })

  it('raises clock precision only for a visible near-term expiry', () => {
    const now = Date.parse('2026-09-15T00:00:30.000Z')
    expect(dashboardClockPrecision(items, now)).toBe(1_000)
    expect(
      dashboardClockPrecision(items, Date.parse('2026-09-15T00:02:00.000Z')),
    ).toBe(60_000)
  })
})
