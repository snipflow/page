import { QueryClient } from '@tanstack/react-query'
import type { ReceivedSnip } from './receive-object.ts'
import { applySnipDelete, applySnipUpsert } from './cache-consistency.ts'
import {
  snipBodyQueryKey,
  snipMetadataQueryKey,
  snipSnapshotQueryKey,
  snipStatsQueryKey,
} from './query-keys.ts'
import type { SnipMetadataResult } from './snip-metadata.ts'
import type { SnipSnapshot, SnipStatsSnapshot } from './snip-snapshot.ts'

const item = {
  key: 'same-key',
  contentType: 'text/plain',
  size: 8,
  source: 'page',
  createdAt: '2026-09-15T00:00:00.000Z',
  expiresAt: null,
}

function cachedBody() {
  return {
    object: { body: new Blob(['old']) },
  } as ReceivedSnip
}

describe('mutation cache consistency', () => {
  it('upserts known metadata, removes the old body, and only dirties stats', () => {
    const queryClient = new QueryClient()
    const sessionId = 'session'
    queryClient.setQueryData<SnipSnapshot>(snipSnapshotQueryKey(sessionId), {
      items: [{ ...item, size: 3 }],
      complete: true,
      nextCursor: null,
      generation: 1,
      snapshotAt: 1,
      refreshState: 'idle',
      failure: null,
    })
    queryClient.setQueryData<SnipStatsSnapshot>(snipStatsQueryKey(sessionId), {
      value: { count: 10, totalSize: 99, storageLimit: 1_000 },
      snapshotAt: 1,
      dirty: false,
      refreshState: 'idle',
    })
    queryClient.setQueryData(
      snipBodyQueryKey(sessionId, item.key),
      cachedBody(),
    )

    expect(applySnipUpsert(queryClient, sessionId, sessionId, item)).toBe(true)

    expect(
      queryClient.getQueryData(snipBodyQueryKey(sessionId, item.key)),
    ).toBeUndefined()
    expect(
      queryClient.getQueryData<SnipSnapshot>(snipSnapshotQueryKey(sessionId))
        ?.items,
    ).toEqual([item])
    expect(
      queryClient.getQueryData<SnipMetadataResult>(
        snipMetadataQueryKey(sessionId, item.key),
      ),
    ).toMatchObject({ item, source: 'mutation' })
    expect(
      queryClient.getQueryData<SnipStatsSnapshot>(snipStatsQueryKey(sessionId)),
    ).toMatchObject({
      value: { count: 10, totalSize: 99, storageLimit: 1_000 },
      dirty: true,
    })
  })

  it('deletes body and metadata without touching another session', () => {
    const queryClient = new QueryClient()
    const bodyKey = snipBodyQueryKey('session', item.key)
    const metadataKey = snipMetadataQueryKey('session', item.key)
    queryClient.setQueryData(bodyKey, cachedBody())
    queryClient.setQueryData<SnipMetadataResult>(metadataKey, {
      item,
      lookupComplete: true,
      pagesScanned: 1,
      resolvedAt: 1,
      source: 'lookup',
    })

    expect(applySnipDelete(queryClient, 'session', 'other', item.key)).toBe(
      false,
    )
    expect(queryClient.getQueryData(bodyKey)).toBeDefined()
    expect(applySnipDelete(queryClient, 'session', 'session', item.key)).toBe(
      true,
    )
    expect(queryClient.getQueryData(bodyKey)).toBeUndefined()
    expect(queryClient.getQueryData(metadataKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<SnipStatsSnapshot>(snipStatsQueryKey('session')),
    ).toMatchObject({ value: null, dirty: true })
  })
})
