export interface SnipIndex {
  key: string
  contentType: string
  filename?: string | null | undefined
  size: number
  createdAt: string
  expiresAt: string | null
}

export interface CreateSnipResponse extends SnipIndex {
  source: string
}

export interface ListSnipsResponse {
  items: SnipIndex[]
  cursor?: string | undefined
}

export interface StatsResponse {
  count: number
  totalSize: number
  storageLimit: number
}

export interface HealthResponse {
  ok: true
}

export interface AuthResponse extends HealthResponse {
  authed: true
}

export interface ApiErrorPayload {
  code: string
  message: string
  requestId: string | null
  issues: unknown[]
}

export interface TextDraftContent {
  kind: 'text'
  text: string
}

export interface AttachmentDraftContent {
  kind: 'attachment'
  body: Blob
  contentType: string
  filename: string
}

export type DraftContent = TextDraftContent | AttachmentDraftContent

export interface SendOptions {
  key: string | null
  ttlSeconds: number | null
  overwrite: boolean
}

export interface PreparedUpload {
  body: Blob
  contentType: string
  filename: string | null
}

export interface ObjectResponseMetadata {
  contentType: string
  contentDisposition: string | null
  contentLength: number | null
  etag: string | null
  serverFilename: string | null
  downloadFilename: string
  issues: string[]
}

export interface ReadSnipResponse {
  key: string
  body: Blob
  metadata: ObjectResponseMetadata
}

export const DEFAULT_SEND_OPTIONS: Readonly<SendOptions> = {
  key: null,
  ttlSeconds: 86_400,
  overwrite: false,
}

export function prepareDraftUpload(content: DraftContent): PreparedUpload {
  if (content.kind === 'text') {
    return {
      body: new Blob([content.text], { type: 'text/plain;charset=utf-8' }),
      contentType: 'text/plain; charset=utf-8',
      filename: null,
    }
  }

  return {
    body: content.body,
    contentType: content.contentType,
    filename: content.filename,
  }
}
