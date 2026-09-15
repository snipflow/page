import { QueryClient } from '@tanstack/react-query'
import type { SnipApi } from '../api/index.ts'
import type { SnipIndex } from '../domain/index.ts'
import { snipMetadataQueryKey, snipSnapshotQueryKey } from './query-keys.ts'
import { findSnipMetadata, loadSnipMetadata } from './snip-metadata.ts'
import type { SnipSnapshot } from './snip-snapshot.ts'

function item(key: string): SnipIndex {
  return {
    key,
    contentType: 'application/octet-stream',
    size: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    expiresAt: null,
  }
}

function apiWithList(list: SnipApi['list']): SnipApi {
  return {
    authenticate: vi.fn<SnipApi['authenticate']>(),
    create: vi.fn<SnipApi['create']>(),
    delete: vi.fn<SnipApi['delete']>(),
    health: vi.fn<SnipApi['health']>(),
    list,
    read: vi.fn<SnipApi['read']>(),
    stats: vi.fn<SnipApi['stats']>(),
  }
}

describe('partial metadata lookup', () => {
  it('walks pages only until the requested key is found', async () => {
    const list = vi.fn<SnipApi['list']>(async (cursor) =>
      cursor
        ? { items: [item('target')], cursor: 'unused-next' }
        : { items: [item('other')], cursor: 'next' },
    )

    const result = await findSnipMetadata(
      apiWithList(list),
      'target',
      undefined,
      () => 42,
    )

    expect(result).toMatchObject({
      item: item('target'),
      lookupComplete: false,
      pagesScanned: 2,
      resolvedAt: 42,
      source: 'lookup',
    })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('reports an incomplete miss when the cursor loops', async () => {
    const list = vi.fn<SnipApi['list']>(async () => ({
      items: [],
      cursor: 'loop',
    }))

    await expect(
      findSnipMetadata(apiWithList(list), 'target'),
    ).resolves.toMatchObject({
      item: null,
      lookupComplete: false,
      pagesScanned: 2,
    })
  })

  it('uses known snapshot metadata without issuing a list request', async () => {
    const queryClient = new QueryClient()
    const sessionId = 'session'
    const known = item('target')
    queryClient.setQueryData<SnipSnapshot>(snipSnapshotQueryKey(sessionId), {
      items: [known],
      complete: false,
      nextCursor: 'next',
      generation: 1,
      snapshotAt: null,
      refreshState: 'loading',
      failure: null,
    })
    const list = vi.fn<SnipApi['list']>()

    await expect(
      loadSnipMetadata({
        api: apiWithList(list),
        queryClient,
        sessionId,
        key: 'target',
      }),
    ).resolves.toMatchObject({
      item: known,
      pagesScanned: 0,
      source: 'snapshot',
    })
    expect(list).not.toHaveBeenCalled()
    expect(
      queryClient.getQueryData(snipMetadataQueryKey(sessionId, 'target')),
    ).toBeDefined()
  })
})
