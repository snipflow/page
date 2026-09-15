import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { isSnipApiError } from '../../api/index.ts'
import type { CreateSnipResponse } from '../../domain/index.ts'
import { SnipValidationError, textByteSize } from '../../domain/index.ts'
import { createSnipMutationKey } from '../../queries/query-keys.ts'
import { applySnipUpsert } from '../../queries/cache-consistency.ts'
import { useAuthRuntime, useAuthSnapshot } from '../auth/auth-context.ts'
import type { SendFailure, SendOperation } from './send-store.ts'
import { useSendStoreApi } from './send-store.ts'

type SendIssueField = 'contentType' | 'filename' | 'key' | 'ttl'

function issueText(issue: unknown) {
  if (!issue || typeof issue !== 'object') return ''
  const record = issue as Record<string, unknown>
  return [record.field, record.path]
    .flatMap((value) =>
      Array.isArray(value)
        ? value.filter((part): part is string => typeof part === 'string')
        : typeof value === 'string'
          ? [value]
          : [],
    )
    .join('.')
    .toLowerCase()
}

function mapIssueFields(issues: unknown[]) {
  const fields = new Set<SendIssueField>()
  for (const issue of issues) {
    const text = issueText(issue)
    if (/(^|[.\-_])key($|[.\-_])/.test(text)) fields.add('key')
    if (text.includes('ttl') || text.includes('expires')) fields.add('ttl')
    if (text.includes('filename')) fields.add('filename')
    if (
      text.includes('content-type') ||
      text.includes('contenttype') ||
      text.includes('mime') ||
      text.includes('format')
    ) {
      fields.add('contentType')
    }
  }
  return fields
}

function invalidInputMessage(issues: unknown[]) {
  const fields = mapIssueFields(issues)
  const messages = [
    fields.has('key') ? '检查自定义 Key' : null,
    fields.has('ttl') ? '重新选择有效期' : null,
    fields.has('filename') ? '检查附件文件名' : null,
    fields.has('contentType') ? '检查附件 MIME' : null,
  ].filter((message): message is string => message !== null)
  return messages.length > 0
    ? `服务端拒绝了发送选项：${messages.join('、')}。`
    : '服务端拒绝了当前正文或发送选项。'
}

function operationByteSize(operation: SendOperation) {
  return operation.content.kind === 'text'
    ? textByteSize(operation.content.text)
    : operation.content.body.size
}

function normalizeSendFailure(
  error: unknown,
  operation: SendOperation,
): SendFailure {
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

    const subject = operation.content.kind === 'text' ? '正文' : '附件'
    const message =
      error.status === 400
        ? invalidInputMessage(error.payload?.issues ?? [])
        : error.status === 413
          ? `${subject}实际大小为 ${operationByteSize(operation).toLocaleString('zh-CN')} B，超过服务端允许的大小。`
          : error.status === 415
            ? operation.content.kind === 'text'
              ? '服务端不支持当前正文的 Content-Type，请检查 API 配置。'
              : '服务端不支持当前附件 MIME，请修正后重试。'
            : error.status === 405
              ? '服务端不接受当前发送方法，请检查 API 配置。'
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
      applySnipUpsert(
        queryClient,
        operation.sessionId,
        session.getSessionId(),
        result,
      )
      store.getState().resolveSend(operation, session.getSessionId(), {
        type: 'success',
        result,
      })
    },
    onError(error, operation) {
      store.getState().resolveSend(operation, session.getSessionId(), {
        type: 'failure',
        failure: normalizeSendFailure(error, operation),
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
