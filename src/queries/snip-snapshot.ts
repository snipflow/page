import type { QueryClient } from '@tanstack/react-query'
import type { SnipApi } from '../api/index.ts'
import type {
  CreateSnipResponse,
  SnipIndex,
  StatsResponse,
} from '../domain/index.ts'
import {
  snipBodyQueryKey,
  snipSnapshotQueryKey,
  snipStatsQueryKey,
} from './query-keys.ts'

export type CachedSnipIndex = SnipIndex & { source?: string }
export type SnapshotFailure = 'cancelled' | 'cursor-loop' | 'request-failed'

export interface SnipSnapshot {
  items: CachedSnipIndex[]
  complete: boolean
  nextCursor: string | null
  generation: number
  snapshotAt: number | null
  refreshState: 'idle' | 'loading' | 'failed'
  failure: SnapshotFailure | null
}

export interface SnipStatsSnapshot {
  value: StatsResponse | null
  snapshotAt: number | null
  dirty: boolean
  refreshState: 'idle' | 'loading' | 'failed'
}

type SnapshotChange =
  | { sequence: number; type: 'upsert'; item: CachedSnipIndex }
  | { sequence: number; type: 'delete'; key: string }

interface SessionLoadState {
  sequence: number
  generation: number
  changes: SnapshotChange[]
  snapshotController: AbortController | null
  statsGeneration: number
  statsController: AbortController | null
}

const clientStates = new WeakMap<QueryClient, Map<string, SessionLoadState>>()

function getSessionState(queryClient: QueryClient, sessionId: string) {
  let sessions = clientStates.get(queryClient)
  if (!sessions) {
    sessions = new Map()
    clientStates.set(queryClient, sessions)
  }
  let state = sessions.get(sessionId)
  if (!state) {
    state = {
      sequence: 0,
      generation: 0,
      changes: [],
      snapshotController: null,
      statsGeneration: 0,
      statsController: null,
    }
    sessions.set(sessionId, state)
  }
  return state
}

function upsert(items: CachedSnipIndex[], item: CachedSnipIndex) {
  const index = items.findIndex((candidate) => candidate.key === item.key)
  if (index === -1) return [...items, item]
  return items.map((candidate, itemIndex) =>
    itemIndex === index ? item : candidate,
  )
}

function applyChanges(items: CachedSnipIndex[], changes: SnapshotChange[]) {
  let result = items
  for (const change of changes) {
    result =
      change.type === 'upsert'
        ? upsert(result, change.item)
        : result.filter((item) => item.key !== change.key)
  }
  return result
}

function mergePage(items: CachedSnipIndex[], pageItems: SnipIndex[]) {
  let result = items
  for (const item of pageItems) result = upsert(result, item)
  return result
}

function failureKind(signal: AbortSignal): SnapshotFailure {
  return signal.aborted ? 'cancelled' : 'request-failed'
}

function attachAbortSignal(controller: AbortController, signal?: AbortSignal) {
  if (!signal) return () => undefined
  if (signal.aborted) {
    controller.abort()
    return () => undefined
  }
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

function isCurrentLoad(
  state: SessionLoadState,
  generation: number,
  isSessionCurrent: () => boolean,
) {
  return state.generation === generation && isSessionCurrent()
}

export interface LoadSnipSnapshotOptions {
  api: SnipApi
  queryClient: QueryClient
  sessionId: string
  signal?: AbortSignal
  isSessionCurrent?: () => boolean
  now?: () => number
}

export async function loadSnipSnapshot({
  api,
  queryClient,
  sessionId,
  signal,
  isSessionCurrent = () => true,
  now = Date.now,
}: LoadSnipSnapshotOptions): Promise<SnipSnapshot | undefined> {
  if (!isSessionCurrent()) return undefined
  const queryKey = snipSnapshotQueryKey(sessionId)
  const state = getSessionState(queryClient, sessionId)
  state.snapshotController?.abort()
  const controller = new AbortController()
  const detachAbortSignal = attachAbortSignal(controller, signal)
  state.snapshotController = controller
  const generation = ++state.generation
  const startSequence = state.sequence
  state.changes = []

  const previous = queryClient.getQueryData<SnipSnapshot>(queryKey)
  const preservePrevious = previous?.complete === true
  if (preservePrevious) {
    queryClient.setQueryData<SnipSnapshot>(queryKey, {
      ...previous,
      generation,
      refreshState: 'loading',
      failure: null,
    })
  } else {
    queryClient.setQueryData<SnipSnapshot>(queryKey, {
      items: [],
      complete: false,
      nextCursor: null,
      generation,
      snapshotAt: null,
      refreshState: 'loading',
      failure: null,
    })
  }

  let candidate: CachedSnipIndex[] = []
  let cursor: string | undefined
  const seenCursors = new Set<string>()

  try {
    while (true) {
      const page = await api.list(cursor, controller.signal)
      if (!isCurrentLoad(state, generation, isSessionCurrent)) {
        return undefined
      }
      candidate = mergePage(candidate, page.items)

      if (page.cursor && seenCursors.has(page.cursor)) {
        const incomplete: SnipSnapshot = {
          items: applyChanges(
            candidate,
            state.changes.filter((change) => change.sequence > startSequence),
          ),
          complete: false,
          nextCursor: page.cursor,
          generation,
          snapshotAt: null,
          refreshState: 'failed',
          failure: 'cursor-loop',
        }
        if (preservePrevious) {
          const current = queryClient.getQueryData<SnipSnapshot>(queryKey)
          const retained = {
            ...(current ?? previous),
            generation,
            refreshState: 'failed' as const,
            failure: 'cursor-loop' as const,
          }
          queryClient.setQueryData(queryKey, retained)
          return retained
        }
        queryClient.setQueryData(queryKey, incomplete)
        return incomplete
      }

      if (!preservePrevious) {
        queryClient.setQueryData<SnipSnapshot>(queryKey, {
          items: applyChanges(
            candidate,
            state.changes.filter((change) => change.sequence > startSequence),
          ),
          complete: false,
          nextCursor: page.cursor ?? null,
          generation,
          snapshotAt: null,
          refreshState: 'loading',
          failure: null,
        })
      }

      if (!page.cursor) break
      seenCursors.add(page.cursor)
      cursor = page.cursor
    }

    if (!isCurrentLoad(state, generation, isSessionCurrent)) return undefined
    const items = applyChanges(
      candidate,
      state.changes.filter((change) => change.sequence > startSequence),
    )
    const completed: SnipSnapshot = {
      items,
      complete: true,
      nextCursor: null,
      generation,
      snapshotAt: now(),
      refreshState: 'idle',
      failure: null,
    }
    queryClient.setQueryData(queryKey, completed)

    if (preservePrevious) {
      for (const item of items) {
        queryClient.removeQueries({
          queryKey: snipBodyQueryKey(sessionId, item.key),
          exact: true,
        })
      }
    }
    state.changes = []
    return completed
  } catch {
    if (!isCurrentLoad(state, generation, isSessionCurrent)) return undefined
    const failure = failureKind(controller.signal)
    if (preservePrevious) {
      const current = queryClient.getQueryData<SnipSnapshot>(queryKey)
      const retained: SnipSnapshot = {
        ...(current ?? previous),
        generation,
        refreshState: 'failed',
        failure,
      }
      queryClient.setQueryData(queryKey, retained)
      return retained
    }
    const incomplete: SnipSnapshot = {
      items: applyChanges(
        candidate,
        state.changes.filter((change) => change.sequence > startSequence),
      ),
      complete: false,
      nextCursor: cursor ?? null,
      generation,
      snapshotAt: null,
      refreshState: 'failed',
      failure,
    }
    queryClient.setQueryData(queryKey, incomplete)
    return incomplete
  } finally {
    detachAbortSignal()
    if (state.generation === generation) state.snapshotController = null
  }
}

export function recordSnapshotUpsert(
  queryClient: QueryClient,
  sessionId: string,
  item: CreateSnipResponse,
) {
  const state = getSessionState(queryClient, sessionId)
  const change: SnapshotChange = {
    sequence: ++state.sequence,
    type: 'upsert',
    item,
  }
  state.changes.push(change)
  queryClient.setQueryData<SnipSnapshot>(
    snipSnapshotQueryKey(sessionId),
    (snapshot) =>
      snapshot
        ? { ...snapshot, items: upsert(snapshot.items, item) }
        : snapshot,
  )
}

export function recordSnapshotDelete(
  queryClient: QueryClient,
  sessionId: string,
  key: string,
) {
  const state = getSessionState(queryClient, sessionId)
  const change: SnapshotChange = {
    sequence: ++state.sequence,
    type: 'delete',
    key,
  }
  state.changes.push(change)
  queryClient.setQueryData<SnipSnapshot>(
    snipSnapshotQueryKey(sessionId),
    (snapshot) =>
      snapshot
        ? {
            ...snapshot,
            items: snapshot.items.filter((item) => item.key !== key),
          }
        : snapshot,
  )
}

export function markSnipStatsDirty(
  queryClient: QueryClient,
  sessionId: string,
) {
  queryClient.setQueryData<SnipStatsSnapshot>(
    snipStatsQueryKey(sessionId),
    (snapshot) => ({
      value: snapshot?.value ?? null,
      snapshotAt: snapshot?.snapshotAt ?? null,
      dirty: true,
      refreshState: snapshot?.refreshState ?? 'idle',
    }),
  )
}

export function cancelSessionCacheLoads(
  queryClient: QueryClient,
  sessionId: string,
) {
  const sessions = clientStates.get(queryClient)
  const state = sessions?.get(sessionId)
  if (!state) return
  state.generation += 1
  state.statsGeneration += 1
  state.snapshotController?.abort()
  state.statsController?.abort()
  sessions?.delete(sessionId)
}

export interface LoadSnipStatsOptions {
  api: SnipApi
  queryClient: QueryClient
  sessionId: string
  signal?: AbortSignal
  isSessionCurrent?: () => boolean
  now?: () => number
}

export async function loadSnipStats({
  api,
  queryClient,
  sessionId,
  signal,
  isSessionCurrent = () => true,
  now = Date.now,
}: LoadSnipStatsOptions): Promise<SnipStatsSnapshot | undefined> {
  if (!isSessionCurrent()) return undefined
  const state = getSessionState(queryClient, sessionId)
  state.statsController?.abort()
  const controller = new AbortController()
  const detachAbortSignal = attachAbortSignal(controller, signal)
  state.statsController = controller
  const generation = ++state.statsGeneration
  const queryKey = snipStatsQueryKey(sessionId)
  const previous = queryClient.getQueryData<SnipStatsSnapshot>(queryKey)
  const startSequence = state.sequence
  queryClient.setQueryData<SnipStatsSnapshot>(queryKey, {
    value: previous?.value ?? null,
    snapshotAt: previous?.snapshotAt ?? null,
    dirty: previous?.dirty ?? false,
    refreshState: 'loading',
  })

  try {
    const value = await api.stats(controller.signal)
    if (state.statsGeneration !== generation || !isSessionCurrent()) {
      return undefined
    }
    const completed: SnipStatsSnapshot = {
      value,
      snapshotAt: now(),
      dirty: state.sequence > startSequence,
      refreshState: 'idle',
    }
    queryClient.setQueryData(queryKey, completed)
    return completed
  } catch {
    if (state.statsGeneration !== generation || !isSessionCurrent()) {
      return undefined
    }
    const current = queryClient.getQueryData<SnipStatsSnapshot>(queryKey)
    const failed: SnipStatsSnapshot = {
      value: current?.value ?? previous?.value ?? null,
      snapshotAt: current?.snapshotAt ?? previous?.snapshotAt ?? null,
      dirty: current?.dirty ?? previous?.dirty ?? false,
      refreshState: 'failed',
    }
    queryClient.setQueryData(queryKey, failed)
    return failed
  } finally {
    detachAbortSignal()
    if (state.statsGeneration === generation) state.statsController = null
  }
}
