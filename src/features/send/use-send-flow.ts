import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { isSnipApiError } from '../../api/index.ts'
import type { CreateSnipResponse } from '../../domain/index.ts'
import { SnipValidationError } from '../../domain/index.ts'
import {
  createSnipMutationKey,
  snipBodyQueryKey,
} from '../../queries/query-keys.ts'
import { useAuthRuntime, useAuthSnapshot } from '../auth/auth-context.ts'
import type { SendFailure, SendOperation } from './send-store.ts'
import { useSendStoreApi } from './send-store.ts'

function normalizeSendFailure(error: unknown): SendFailure {
  if (error instanceof SnipValidationError) {
    return {
      kind: 'rejected',
      message:
        error.field === 'key'
          ? '自定义 key 只能包含字母、数字、下划线或连字符。'
          : '发送选项无效，请检查后重试。',
      requestId: null,
      status: null,
    }
  }
  if (isSnipApiError(error)) {
    if (error.status === 409) {
      return {
        kind: 'conflict',
        message: '该 key 已存在。请修改 key，或明确允许覆盖后再发送。',
        requestId: error.requestId,
        status: error.status,
      }
    }
    if (error.outcome === 'unknown') {
      return {
        kind: 'uncertain',
        message: '无法确认服务端是否已经保存，本次请求不会自动重发。',
        requestId: error.requestId,
        status: error.status ?? null,
      }
    }

    const message =
      error.status === 413
        ? '正文超过服务端允许的大小。'
        : error.status === 400 || error.status === 415
          ? '服务端拒绝了当前正文或发送选项。'
          : '发送未完成，请检查内容与发送选项。'
    return {
      kind: 'rejected',
      message,
      requestId: error.requestId,
      status: error.status ?? null,
    }
  }

  return {
    kind: 'uncertain',
    message: '无法确认服务端是否已经保存，本次请求不会自动重发。',
    requestId: null,
    status: null,
  }
}

export function useSendFlow() {
  const { api, session } = useAuthRuntime()
  const auth = useAuthSnapshot()
  const store = useSendStoreApi()
  const queryClient = useQueryClient()
  const sessionId = auth.sessionId ?? 'no-session'

  const { isPending, mutate } = useMutation<
    CreateSnipResponse,
    unknown,
    SendOperation
  >({
    mutationKey: createSnipMutationKey(sessionId),
    mutationFn: (operation) =>
      api.create({
        content: operation.content,
        options: operation.options,
      }),
    onSuccess(result, operation) {
      if (session.getSessionId() !== operation.sessionId) {
        return
      }
      queryClient.removeQueries({
        queryKey: snipBodyQueryKey(operation.sessionId, result.key),
        exact: true,
      })
      store.getState().resolveSend(operation, session.getSessionId(), {
        type: 'success',
        result,
      })
    },
    onError(error, operation) {
      store.getState().resolveSend(operation, session.getSessionId(), {
        type: 'failure',
        failure: normalizeSendFailure(error),
      })
    },
    retry: false,
  })

  const submit = useCallback(() => {
    const currentSessionId = session.getSessionId()
    if (!currentSessionId) {
      return false
    }
    const operation = store.getState().beginSend(currentSessionId)
    if (!operation) {
      return false
    }
    mutate(operation)
    return true
  }, [mutate, session, store])

  return { isPending, submit }
}
