import {
  deriveContentType,
  type FileTypeGroup,
  type SnipIndex,
} from '../../domain/index.ts'
import type { CachedSnipIndex } from '../../queries/snip-snapshot.ts'

const BLOCK_SPANS: Readonly<Record<FileTypeGroup, number>> = {
  archive: 30,
  code: 34,
  document: 36,
  image: 42,
  other: 32,
  text: 34,
}

function compareKeys(left: string, right: string) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function sortDashboardItems(items: readonly CachedSnipIndex[]) {
  return [...items].sort((left, right) => {
    const createdOrder =
      Date.parse(right.createdAt) - Date.parse(left.createdAt)
    return createdOrder || compareKeys(left.key, right.key)
  })
}

export function filterDashboardItems(
  items: readonly CachedSnipIndex[],
  query: string,
) {
  return query ? items.filter((item) => item.key.includes(query)) : [...items]
}

export function deriveDashboardFileType(item: SnipIndex) {
  return deriveContentType({
    contentType: item.contentType,
    disposition: item.filename ? 'attachment' : null,
    filename: item.filename ?? null,
    utf8Decodable: null,
  }).fileType
}

export function dashboardBlockSpan(item: SnipIndex) {
  const definition = deriveDashboardFileType(item)
  const baseSpan = BLOCK_SPANS[definition.group]
  const identityLength = Math.max(item.key.length, item.filename?.length ?? 0)
  return identityLength > 56 ? baseSpan + 4 : baseSpan
}

export interface ExpiryState {
  expired: boolean
  remainingMs: number | null
}

export function getExpiryState(
  expiresAt: string | null,
  now: number,
): ExpiryState {
  if (expiresAt === null) return { expired: false, remainingMs: null }
  const remainingMs = Math.max(0, Date.parse(expiresAt) - now)
  return { expired: remainingMs === 0, remainingMs }
}

export function formatRemainingTime(remainingMs: number | null) {
  if (remainingMs === null) return '永久'
  if (remainingMs <= 0) return '已过期'
  if (remainingMs < 60_000) return `${Math.ceil(remainingMs / 1_000)} 秒`
  if (remainingMs < 3_600_000) return `${Math.ceil(remainingMs / 60_000)} 分钟`
  if (remainingMs < 86_400_000) {
    return `${Math.ceil(remainingMs / 3_600_000)} 小时`
  }
  return `${Math.ceil(remainingMs / 86_400_000)} 天`
}

export function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KiB`
  if (bytes < 1_073_741_824) {
    return `${(bytes / 1_048_576).toFixed(1)} MiB`
  }
  return `${(bytes / 1_073_741_824).toFixed(1)} GiB`
}

export function dashboardClockPrecision(
  items: readonly SnipIndex[],
  now: number,
) {
  const hasNearExpiry = items.some((item) => {
    const { remainingMs } = getExpiryState(item.expiresAt, now)
    return remainingMs !== null && remainingMs > 0 && remainingMs <= 60_000
  })
  return hasNearExpiry ? 1_000 : 60_000
}
