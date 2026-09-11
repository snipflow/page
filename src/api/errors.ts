import type { ApiErrorPayload } from '../domain/models.ts'

export type ApiOperation =
  'auth' | 'create' | 'delete' | 'health' | 'list' | 'read' | 'stats'

export type ApiErrorKind =
  'aborted' | 'configuration' | 'http' | 'network' | 'protocol'

export type ApiOutcome = 'rejected' | 'unknown'

interface SnipApiErrorOptions {
  kind: ApiErrorKind
  operation: ApiOperation
  outcome: ApiOutcome
  status?: number
  payload?: ApiErrorPayload
  requestId?: string | null
  cause?: unknown
}

export class SnipApiError extends Error {
  readonly kind: ApiErrorKind
  readonly operation: ApiOperation
  readonly outcome: ApiOutcome
  readonly status: number | undefined
  readonly payload: ApiErrorPayload | undefined
  readonly requestId: string | null

  constructor(message: string, options: SnipApiErrorOptions) {
    super(message, { cause: options.cause })
    this.name = 'SnipApiError'
    this.kind = options.kind
    this.operation = options.operation
    this.outcome = options.outcome
    this.status = options.status
    this.payload = options.payload
    this.requestId = options.requestId ?? options.payload?.requestId ?? null
  }
}

export function isSnipApiError(error: unknown): error is SnipApiError {
  return error instanceof SnipApiError
}
