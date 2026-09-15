import type { QueryClient } from '@tanstack/react-query'
import type { CreateSnipResponse } from '../domain/index.ts'
import { snipBodyQueryKey, snipMetadataQueryKey } from './query-keys.ts'
import type { SnipMetadataResult } from './snip-metadata.ts'
import {
  markSnipStatsDirty,
  recordSnapshotDelete,
  recordSnapshotUpsert,
} from './snip-snapshot.ts'

function belongsToCurrentSession(
  sessionId: string,
  currentSessionId: string | null,
) {
  return currentSessionId === sessionId
}

export function applySnipUpsert(
  queryClient: QueryClient,
  sessionId: string,
  currentSessionId: string | null,
  item: CreateSnipResponse,
) {
  if (!belongsToCurrentSession(sessionId, currentSessionId)) return false
  recordSnapshotUpsert(queryClient, sessionId, item)
  queryClient.setQueryData<SnipMetadataResult>(
    snipMetadataQueryKey(sessionId, item.key),
    {
      item,
      lookupComplete: true,
      pagesScanned: 0,
      resolvedAt: Date.now(),
      source: 'mutation',
    },
  )
  queryClient.removeQueries({
    queryKey: snipBodyQueryKey(sessionId, item.key),
    exact: true,
  })
  markSnipStatsDirty(queryClient, sessionId)
  return true
}

export function applySnipDelete(
  queryClient: QueryClient,
  sessionId: string,
  currentSessionId: string | null,
  key: string,
) {
  if (!belongsToCurrentSession(sessionId, currentSessionId)) return false
  recordSnapshotDelete(queryClient, sessionId, key)
  queryClient.removeQueries({
    queryKey: snipBodyQueryKey(sessionId, key),
    exact: true,
  })
  queryClient.removeQueries({
    queryKey: snipMetadataQueryKey(sessionId, key),
    exact: true,
  })
  markSnipStatsDirty(queryClient, sessionId)
  return true
}
