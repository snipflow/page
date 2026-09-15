import type { QueryClient } from '@tanstack/react-query'
import type { SnipApi } from '../api/index.ts'
import type { SnipIndex } from '../domain/index.ts'
import { snipMetadataQueryKey, snipSnapshotQueryKey } from './query-keys.ts'
import type { CachedSnipIndex, SnipSnapshot } from './snip-snapshot.ts'

export interface SnipMetadataResult {
  item: CachedSnipIndex | null
  lookupComplete: boolean
  pagesScanned: number
  resolvedAt: number | null
  source: 'lookup' | 'mutation' | 'snapshot'
}

export function metadataFromSnapshot(
  queryClient: QueryClient,
  sessionId: string,
  key: string,
): CachedSnipIndex | null {
  const snapshot = queryClient.getQueryData<SnipSnapshot>(
    snipSnapshotQueryKey(sessionId),
  )
  return snapshot?.items.find((item) => item.key === key) ?? null
}

export async function findSnipMetadata(
  api: SnipApi,
  key: string,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<SnipMetadataResult> {
  // TODO(worker-metadata): Remove this paginated list fallback after
  // GET /snip/:key returns authoritative createdAt and expiresAt metadata.
  let cursor: string | undefined
  let pagesScanned = 0
  const seenCursors = new Set<string>()

  while (true) {
    const page = await api.list(cursor, signal)
    pagesScanned += 1
    const item = page.items.find(
      (candidate: SnipIndex) => candidate.key === key,
    )
    if (item) {
      return {
        item,
        lookupComplete: !page.cursor,
        pagesScanned,
        resolvedAt: now(),
        source: 'lookup',
      }
    }
    if (!page.cursor) {
      return {
        item: null,
        lookupComplete: true,
        pagesScanned,
        resolvedAt: now(),
        source: 'lookup',
      }
    }
    if (seenCursors.has(page.cursor)) {
      return {
        item: null,
        lookupComplete: false,
        pagesScanned,
        resolvedAt: now(),
        source: 'lookup',
      }
    }
    seenCursors.add(page.cursor)
    cursor = page.cursor
  }
}

export interface LoadSnipMetadataOptions {
  api: SnipApi
  queryClient: QueryClient
  sessionId: string
  key: string
  signal?: AbortSignal
  isSessionCurrent?: () => boolean
  force?: boolean
  now?: () => number
}

export function createSnipMetadataQuery(
  api: SnipApi,
  key: string,
  now: () => number = Date.now,
  externalSignal?: AbortSignal,
) {
  return ({ signal }: { signal: AbortSignal }) =>
    findSnipMetadata(api, key, externalSignal ?? signal, now)
}

export async function loadSnipMetadata({
  api,
  queryClient,
  sessionId,
  key,
  signal,
  isSessionCurrent = () => true,
  force = false,
  now = Date.now,
}: LoadSnipMetadataOptions): Promise<SnipMetadataResult | undefined> {
  if (!isSessionCurrent()) return undefined
  const known = metadataFromSnapshot(queryClient, sessionId, key)
  if (known) {
    const result: SnipMetadataResult = {
      item: known,
      lookupComplete: true,
      pagesScanned: 0,
      resolvedAt: now(),
      source: 'snapshot',
    }
    queryClient.setQueryData(snipMetadataQueryKey(sessionId, key), result)
    return result
  }

  const result = await queryClient.query({
    queryKey: snipMetadataQueryKey(sessionId, key),
    queryFn: createSnipMetadataQuery(api, key, now, signal),
    staleTime: force ? 0 : Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  if (!isSessionCurrent()) {
    queryClient.removeQueries({
      queryKey: snipMetadataQueryKey(sessionId, key),
      exact: true,
    })
    return undefined
  }
  return result
}
