import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { isSnipApiError, type SnipApi } from '../../api/index.ts'
import {
  deleteSnipMutationKey,
  snipBodyQueryKey,
  snipSnapshotQueryKey,
  snipStatsQueryKey,
} from '../../queries/query-keys.ts'
import { applySnipDelete } from '../../queries/cache-consistency.ts'
import {
  loadSnipSnapshot,
  loadSnipStats,
  type SnipSnapshot,
  type SnipStatsSnapshot,
} from '../../queries/snip-snapshot.ts'
import {
  readReceivedSnip,
  type ReceivedSnip,
} from '../../queries/receive-object.ts'
import { useAuthRuntime, useAuthSnapshot } from '../auth/auth-context.ts'
import { useDashboardStore } from './dashboard-store.ts'

function createReadQuery(api: SnipApi, key: string) {
  return ({ signal }: { signal: AbortSignal }) =>
    readReceivedSnip(api, key, signal)
}

interface DeleteVariables {
  key: string
  sessionId: string
}

export type DashboardDeleteOutcome = 'deleted' | 'missing'

export function useDashboardFlow() {
  const { api, session } = useAuthRuntime()
  const auth = useAuthSnapshot()
  const queryClient = useQueryClient()
  const detailKey = useDashboardStore((state) => state.detailKey)
  const sessionId = auth.sessionId ?? 'no-session'
  const snapshotKey = useMemo(
    () => snipSnapshotQueryKey(sessionId),
    [sessionId],
  )
  const statsKey = useMemo(() => snipStatsQueryKey(sessionId), [sessionId])
  const bodyKey = useMemo(
    () => snipBodyQueryKey(sessionId, detailKey ?? 'no-key'),
    [detailKey, sessionId],
  )

  const snapshotQuery = useQuery<SnipSnapshot>({
    queryKey: snapshotKey,
    queryFn: async () => {
      throw new Error('Dashboard snapshots are loaded explicitly')
    },
    enabled: false,
  })
  const statsQuery = useQuery<SnipStatsSnapshot>({
    queryKey: statsKey,
    queryFn: async () => {
      throw new Error('Dashboard stats are loaded explicitly')
    },
    enabled: false,
  })
  const bodyQuery = useQuery<ReceivedSnip>({
    queryKey: bodyKey,
    queryFn: createReadQuery(api, detailKey ?? 'no-key'),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  useEffect(() => {
    const currentSessionId = session.getSessionId()
    if (!currentSessionId || currentSessionId !== sessionId) return

    const loads: Promise<unknown>[] = []
    if (!queryClient.getQueryData(snapshotKey)) {
      loads.push(
        loadSnipSnapshot({
          api,
          queryClient,
          sessionId: currentSessionId,
          isSessionCurrent: () => session.getSessionId() === currentSessionId,
        }),
      )
    }
    if (!queryClient.getQueryData(statsKey)) {
      loads.push(
        loadSnipStats({
          api,
          queryClient,
          sessionId: currentSessionId,
          isSessionCurrent: () => session.getSessionId() === currentSessionId,
        }),
      )
    }
    if (loads.length > 0) void Promise.all(loads)
  }, [api, queryClient, session, sessionId, snapshotKey, statsKey])

  const refreshSnapshot = useCallback(() => {
    const currentSessionId = session.getSessionId()
    if (!currentSessionId || currentSessionId !== sessionId) return false
    void loadSnipSnapshot({
      api,
      queryClient,
      sessionId: currentSessionId,
      isSessionCurrent: () => session.getSessionId() === currentSessionId,
    })
    return true
  }, [api, queryClient, session, sessionId])

  const refreshStats = useCallback(() => {
    const currentSessionId = session.getSessionId()
    if (!currentSessionId || currentSessionId !== sessionId) return false
    void loadSnipStats({
      api,
      queryClient,
      sessionId: currentSessionId,
      isSessionCurrent: () => session.getSessionId() === currentSessionId,
    })
    return true
  }, [api, queryClient, session, sessionId])

  const refresh = useCallback(() => {
    if (!refreshSnapshot() || !refreshStats()) return false
    return true
  }, [refreshSnapshot, refreshStats])

  const requestBody = useCallback(
    async (key: string, force = false) => {
      const currentSessionId = session.getSessionId()
      if (!currentSessionId || currentSessionId !== sessionId) return undefined
      const queryKey = snipBodyQueryKey(currentSessionId, key)
      try {
        return await queryClient.query({
          queryKey,
          queryFn: createReadQuery(api, key),
          staleTime: force ? 0 : Number.POSITIVE_INFINITY,
          retry: false,
        })
      } catch (error) {
        if (force) {
          queryClient.removeQueries({ queryKey, exact: true })
        }
        throw error
      }
    },
    [api, queryClient, session, sessionId],
  )

  const { isPending: deletePending, mutateAsync: mutateDelete } = useMutation<
    DashboardDeleteOutcome,
    unknown,
    DeleteVariables
  >({
    mutationKey: deleteSnipMutationKey(sessionId, detailKey ?? 'no-key'),
    async mutationFn({ key }) {
      try {
        await api.delete(key)
        return 'deleted'
      } catch (error) {
        if (isSnipApiError(error) && error.status === 404) return 'missing'
        throw error
      }
    },
    onSuccess(_outcome, variables) {
      const applied = applySnipDelete(
        queryClient,
        variables.sessionId,
        session.getSessionId(),
        variables.key,
      )
      if (applied) refreshStats()
    },
    retry: false,
  })

  const deleteItem = useCallback(
    (key: string) => {
      const currentSessionId = session.getSessionId()
      if (!currentSessionId || currentSessionId !== sessionId) {
        return Promise.reject(
          new Error('The dashboard session is no longer active'),
        )
      }
      return mutateDelete({ key, sessionId: currentSessionId })
    },
    [mutateDelete, session, sessionId],
  )

  return {
    body: bodyQuery.data ?? null,
    bodyError: bodyQuery.error,
    bodyLoading: bodyQuery.isFetching,
    deleteItem,
    deletePending,
    refresh,
    refreshSnapshot,
    refreshStats,
    requestBody,
    snapshot: snapshotQuery.data ?? null,
    stats: statsQuery.data ?? null,
  }
}
