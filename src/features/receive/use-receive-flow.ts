import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { isSnipApiError, type SnipApi } from '../../api/index.ts'
import { requireSnipKey } from '../../domain/index.ts'
import {
  deleteSnipMutationKey,
  snipBodyQueryKey,
} from '../../queries/query-keys.ts'
import {
  readReceivedSnip,
  type ReceivedSnip,
} from '../../queries/receive-object.ts'
import { useAuthRuntime, useAuthSnapshot } from '../auth/auth-context.ts'
import type {
  ReceiveFailure,
  ReceiveOperationIdentity,
} from './receive-store.ts'
import { useReceiveStore, useReceiveStoreApi } from './receive-store.ts'

function normalizeReadFailure(error: unknown): ReceiveFailure {
  if (isSnipApiError(error)) {
    if (error.status === 404) {
      return {
        kind: 'missing',
        message: '没有找到这个 key，对象可能已删除或过期。',
        requestId: error.requestId,
      }
    }
    if (error.kind === 'network' || error.status === undefined) {
      return {
        kind: 'network',
        message: '无法连接服务，已保留 key。',
        requestId: error.requestId,
      }
    }
    return {
      kind: 'rejected',
      message: '服务端拒绝了这次读取请求。',
      requestId: error.requestId,
    }
  }
  return {
    kind: 'rejected',
    message: '当前 key 无效，请检查后重试。',
    requestId: null,
  }
}

function deleteFailureMessage(error: unknown) {
  if (isSnipApiError(error)) {
    if (error.status === 404) {
      return { type: 'missing' as const, failure: normalizeReadFailure(error) }
    }
    const uncertain = error.outcome === 'unknown'
    return {
      type: 'failure' as const,
      uncertain,
      message: uncertain
        ? '无法确认对象是否已删除，本次请求不会自动重发。'
        : '删除未完成，原内容仍保留在当前页面。',
    }
  }
  return {
    type: 'failure' as const,
    uncertain: true,
    message: '无法确认对象是否已删除，本次请求不会自动重发。',
  }
}

function createReadQuery(api: SnipApi, key: string) {
  return ({ signal }: { signal: AbortSignal }) =>
    readReceivedSnip(api, key, signal)
}

export function useReceiveFlow() {
  const { api, session } = useAuthRuntime()
  const auth = useAuthSnapshot()
  const store = useReceiveStoreApi()
  const view = useReceiveStore((state) => state.view)
  const queryClient = useQueryClient()
  const sessionId = auth.sessionId ?? 'no-session'
  const referencedOperation =
    view.status === 'result'
      ? view.result
      : view.status === 'loading' || view.status === 'error'
        ? view.operation
        : null
  const referencedKey = referencedOperation?.key ?? 'no-key'

  const objectQuery = useQuery<ReceivedSnip>({
    queryKey: snipBodyQueryKey(sessionId, referencedKey),
    queryFn: createReadQuery(api, referencedKey),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const submit = useCallback(() => {
    const currentSessionId = session.getSessionId()
    if (!currentSessionId) {
      return false
    }
    const key = store.getState().inputKey
    const previousView = store.getState().view
    const operation = store.getState().beginRead(currentSessionId, key)
    if (!operation) {
      return false
    }

    const run = async () => {
      try {
        requireSnipKey(key)
      } catch (error) {
        store.getState().resolveRead(operation, session.getSessionId(), {
          type: 'failure',
          failure: normalizeReadFailure(error),
        })
        return
      }

      if (previousView.status === 'loading') {
        await queryClient.cancelQueries({
          queryKey: snipBodyQueryKey(
            previousView.operation.sessionId,
            previousView.operation.key,
          ),
          exact: true,
        })
      }
      await queryClient.cancelQueries({
        queryKey: snipBodyQueryKey(operation.sessionId, operation.key),
        exact: true,
      })

      try {
        await queryClient.fetchQuery({
          queryKey: snipBodyQueryKey(operation.sessionId, operation.key),
          queryFn: createReadQuery(api, operation.key),
          staleTime: 0,
          retry: false,
        })
        store.getState().resolveRead(operation, session.getSessionId(), {
          type: 'success',
        })
      } catch (error) {
        store.getState().resolveRead(operation, session.getSessionId(), {
          type: 'failure',
          failure: normalizeReadFailure(error),
        })
      }
    }

    void run()
    return true
  }, [api, queryClient, session, store])

  const { isPending: isDeleting, mutate: mutateDelete } = useMutation<
    void,
    unknown,
    ReceiveOperationIdentity
  >({
    mutationKey: deleteSnipMutationKey(sessionId, referencedKey),
    mutationFn: (operation) => api.delete(operation.key),
    onSuccess(_result, operation) {
      if (session.getSessionId() !== operation.sessionId) {
        return
      }
      queryClient.removeQueries({
        queryKey: snipBodyQueryKey(operation.sessionId, operation.key),
        exact: true,
      })
      store.getState().resolveDelete(operation, session.getSessionId(), {
        type: 'success',
      })
    },
    onError(error, operation) {
      const resolution = deleteFailureMessage(error)
      if (resolution.type === 'missing') {
        queryClient.removeQueries({
          queryKey: snipBodyQueryKey(operation.sessionId, operation.key),
          exact: true,
        })
      }
      store
        .getState()
        .resolveDelete(operation, session.getSessionId(), resolution)
    },
    retry: false,
  })

  const confirmDelete = useCallback(() => {
    const currentSessionId = session.getSessionId()
    if (!currentSessionId) {
      return false
    }
    const operation = store.getState().beginDelete(currentSessionId)
    if (!operation) {
      return false
    }
    mutateDelete(operation)
    return true
  }, [mutateDelete, session, store])

  const returnToInput = useCallback(() => {
    const currentView = store.getState().view
    if (currentView.status === 'loading') {
      void queryClient.cancelQueries({
        queryKey: snipBodyQueryKey(
          currentView.operation.sessionId,
          currentView.operation.key,
        ),
        exact: true,
      })
    }
    store.getState().returnToInput()
  }, [queryClient, store])

  return {
    confirmDelete,
    data: objectQuery.data,
    isDeleting,
    returnToInput,
    submit,
  }
}
