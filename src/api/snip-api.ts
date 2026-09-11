import type { z } from 'zod'
import type {
  AuthResponse,
  CreateSnipResponse,
  DraftContent,
  HealthResponse,
  ListSnipsResponse,
  ReadSnipResponse,
  SendOptions,
  StatsResponse,
} from '../domain/models.ts'
import { prepareDraftUpload } from '../domain/models.ts'
import { requireSnipKey } from '../domain/validation.ts'
import { SnipApiError, type ApiOperation } from './errors.ts'
import {
  buildAuthorizationHeaders,
  buildCreateHeaders,
  parseObjectResponseMetadata,
} from './headers.ts'
import {
  authResponseSchema,
  createSnipResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  listSnipsResponseSchema,
  statsResponseSchema,
} from './schemas.ts'

type FetchImplementation = typeof fetch

export interface SnipApiOptions {
  getToken: () => string | null
  getSessionId?: () => string | null
  baseUrl?: string
  fetch?: FetchImplementation
  onUnauthorized?: (sessionId: string | null) => void
}

export interface CreateSnipInput {
  content: DraftContent
  options: SendOptions
  source?: string
}

export interface SnipApi {
  health(signal?: AbortSignal): Promise<HealthResponse>
  authenticate(signal?: AbortSignal): Promise<AuthResponse>
  create(
    input: CreateSnipInput,
    signal?: AbortSignal,
  ): Promise<CreateSnipResponse>
  list(cursor?: string, signal?: AbortSignal): Promise<ListSnipsResponse>
  read(key: string, signal?: AbortSignal): Promise<ReadSnipResponse>
  delete(key: string, signal?: AbortSignal): Promise<void>
  stats(signal?: AbortSignal): Promise<StatsResponse>
}

interface RequestOptions {
  method: 'DELETE' | 'GET' | 'POST'
  operation: ApiOperation
  expectedStatus: number
  headers?: Headers
  body?: Blob
  authSessionId?: string | null
  signal?: AbortSignal
}

function isWriteOperation(operation: ApiOperation) {
  return operation === 'create' || operation === 'delete'
}

function isAbortError(cause: unknown) {
  return cause instanceof Error && cause.name === 'AbortError'
}

function buildRequestUrl(baseUrl: string, path: string) {
  if (!baseUrl) {
    return path
  }
  return new URL(
    path,
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
  ).toString()
}

async function parseControlResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  operation: ApiOperation,
): Promise<T> {
  let responseText: string
  try {
    responseText = await response.text()
  } catch (cause) {
    const aborted = isAbortError(cause)
    throw new SnipApiError(
      aborted
        ? 'Control response body reading was aborted'
        : 'Control response body could not be read',
      {
        kind: aborted ? 'aborted' : 'network',
        operation,
        outcome: isWriteOperation(operation) ? 'unknown' : 'rejected',
        requestId: response.headers.get('x-request-id'),
        cause,
      },
    )
  }

  let value: unknown
  try {
    value = JSON.parse(responseText)
  } catch (cause) {
    throw new SnipApiError('Control endpoint returned invalid JSON', {
      kind: 'protocol',
      operation,
      outcome: isWriteOperation(operation) ? 'unknown' : 'rejected',
      requestId: response.headers.get('x-request-id'),
      cause,
    })
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    throw new SnipApiError('Control endpoint returned an invalid response', {
      kind: 'protocol',
      operation,
      outcome: isWriteOperation(operation) ? 'unknown' : 'rejected',
      requestId: response.headers.get('x-request-id'),
      cause: result.error,
    })
  }
  return result.data
}

async function parseErrorPayload(response: Response) {
  try {
    const value: unknown = JSON.parse(await response.text())
    const result = errorResponseSchema.safeParse(value)
    if (!result.success) {
      return undefined
    }

    return {
      code: result.data.error.code,
      message: result.data.error.message,
      requestId:
        result.data.error.requestId ??
        response.headers.get('x-request-id') ??
        null,
      issues: result.data.error.issues ?? [],
    }
  } catch {
    return undefined
  }
}

function requireRuntimeToken(
  getToken: SnipApiOptions['getToken'],
  operation: ApiOperation,
) {
  const token = getToken()
  if (!token) {
    throw new SnipApiError('A runtime token is required', {
      kind: 'configuration',
      operation,
      outcome: 'rejected',
    })
  }
  return token
}

export function createSnipApi({
  getToken,
  getSessionId,
  baseUrl = '',
  fetch: fetchImplementation = globalThis.fetch,
  onUnauthorized,
}: SnipApiOptions): SnipApi {
  async function request(path: string, options: RequestOptions) {
    const init: RequestInit = {
      method: options.method,
      cache: 'no-store',
    }
    if (options.headers) {
      init.headers = options.headers
    }
    if (options.body) {
      init.body = options.body
    }
    if (options.signal) {
      init.signal = options.signal
    }

    let response: Response
    try {
      response = await fetchImplementation(buildRequestUrl(baseUrl, path), init)
    } catch (cause) {
      const aborted = isAbortError(cause)
      throw new SnipApiError(
        aborted ? 'Request was aborted' : 'Network request failed',
        {
          kind: aborted ? 'aborted' : 'network',
          operation: options.operation,
          outcome: isWriteOperation(options.operation) ? 'unknown' : 'rejected',
          cause,
        },
      )
    }

    if (response.status === options.expectedStatus) {
      return response
    }

    if (!response.ok || response.status !== options.expectedStatus) {
      const payload = await parseErrorPayload(response)
      if (response.status === 401) {
        onUnauthorized?.(options.authSessionId ?? null)
      }
      throw new SnipApiError(
        payload?.message ?? `Unexpected HTTP status ${response.status}`,
        {
          kind: response.ok ? 'protocol' : 'http',
          operation: options.operation,
          outcome:
            isWriteOperation(options.operation) && response.status >= 500
              ? 'unknown'
              : 'rejected',
          status: response.status,
          ...(payload ? { payload } : {}),
          requestId: response.headers.get('x-request-id'),
        },
      )
    }

    return response
  }

  function authorization(operation: ApiOperation) {
    const token = requireRuntimeToken(getToken, operation)
    return {
      headers: buildAuthorizationHeaders(token),
      sessionId: getSessionId?.() ?? null,
      token,
    }
  }

  return {
    async health(signal) {
      const response = await request('/health', {
        method: 'GET',
        operation: 'health',
        expectedStatus: 200,
        ...(signal ? { signal } : {}),
      })
      return parseControlResponse(response, healthResponseSchema, 'health')
    },

    async authenticate(signal) {
      const currentAuthorization = authorization('auth')
      const response = await request('/health/auth', {
        method: 'GET',
        operation: 'auth',
        expectedStatus: 200,
        headers: currentAuthorization.headers,
        authSessionId: currentAuthorization.sessionId,
        ...(signal ? { signal } : {}),
      })
      return parseControlResponse(response, authResponseSchema, 'auth')
    },

    async create(input, signal) {
      const currentAuthorization = authorization('create')
      const upload = prepareDraftUpload(input.content)
      const headers = buildCreateHeaders({
        token: currentAuthorization.token,
        upload,
        options: input.options,
        ...(input.source ? { source: input.source } : {}),
      })
      const response = await request('/snip', {
        method: 'POST',
        operation: 'create',
        expectedStatus: 201,
        headers,
        body: upload.body,
        authSessionId: currentAuthorization.sessionId,
        ...(signal ? { signal } : {}),
      })
      return parseControlResponse(response, createSnipResponseSchema, 'create')
    },

    async list(cursor, signal) {
      const search = new URLSearchParams()
      if (cursor !== undefined) {
        if (!cursor) {
          throw new SnipApiError('Cursor cannot be empty', {
            kind: 'configuration',
            operation: 'list',
            outcome: 'rejected',
          })
        }
        search.set('cursor', cursor)
      }
      const query = search.size ? `?${search.toString()}` : ''
      const currentAuthorization = authorization('list')
      const response = await request(`/snip${query}`, {
        method: 'GET',
        operation: 'list',
        expectedStatus: 200,
        headers: currentAuthorization.headers,
        authSessionId: currentAuthorization.sessionId,
        ...(signal ? { signal } : {}),
      })
      return parseControlResponse(response, listSnipsResponseSchema, 'list')
    },

    async read(key, signal) {
      const validKey = requireSnipKey(key)
      const currentAuthorization = authorization('read')
      const response = await request(`/snip/${encodeURIComponent(validKey)}`, {
        method: 'GET',
        operation: 'read',
        expectedStatus: 200,
        headers: currentAuthorization.headers,
        authSessionId: currentAuthorization.sessionId,
        ...(signal ? { signal } : {}),
      })
      let body: Blob
      try {
        body = await response.blob()
      } catch (cause) {
        const aborted = isAbortError(cause)
        throw new SnipApiError(
          aborted
            ? 'Object response body reading was aborted'
            : 'Object response body could not be read',
          {
            kind: aborted ? 'aborted' : 'network',
            operation: 'read',
            outcome: 'rejected',
            requestId: response.headers.get('x-request-id'),
            cause,
          },
        )
      }
      return {
        key: validKey,
        body,
        metadata: parseObjectResponseMetadata(validKey, response.headers),
      }
    },

    async delete(key, signal) {
      const validKey = requireSnipKey(key)
      const currentAuthorization = authorization('delete')
      await request(`/snip/${encodeURIComponent(validKey)}`, {
        method: 'DELETE',
        operation: 'delete',
        expectedStatus: 204,
        headers: currentAuthorization.headers,
        authSessionId: currentAuthorization.sessionId,
        ...(signal ? { signal } : {}),
      })
    },

    async stats(signal) {
      const currentAuthorization = authorization('stats')
      const response = await request('/stats', {
        method: 'GET',
        operation: 'stats',
        expectedStatus: 200,
        headers: currentAuthorization.headers,
        authSessionId: currentAuthorization.sessionId,
        ...(signal ? { signal } : {}),
      })
      return parseControlResponse(response, statsResponseSchema, 'stats')
    },
  }
}
