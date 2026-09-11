import type { SnipApi } from '../api/index.ts'
import type { ReadSnipResponse } from '../domain/index.ts'
import { parseMimeType } from '../domain/index.ts'

export interface ReceivedTextSnip {
  object: ReadSnipResponse
  text: string
}

export class ReceiveTextError extends Error {
  readonly kind = 'read'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ReceiveTextError'
  }
}

function supportsTextPreview(contentType: string) {
  const mime = parseMimeType(contentType)
  if (!mime) {
    return false
  }
  return (
    mime.essence.startsWith('text/') ||
    mime.essence === 'application/json' ||
    mime.essence === 'application/javascript' ||
    mime.essence === 'application/xml'
  )
}

export async function readTextSnip(
  api: SnipApi,
  key: string,
  signal?: AbortSignal,
): Promise<ReceivedTextSnip> {
  const object = await api.read(key, signal)
  if (!supportsTextPreview(object.metadata.contentType)) {
    throw new ReceiveTextError('当前对象不是可安全解码的文本')
  }

  const mime = parseMimeType(object.metadata.contentType)
  const charset = mime?.parameters.get('charset') ?? 'utf-8'
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charset, { fatal: true })
  } catch (cause) {
    throw new ReceiveTextError('当前文本编码暂不受支持', { cause })
  }

  try {
    return {
      object,
      text: decoder.decode(await object.body.arrayBuffer()),
    }
  } catch (cause) {
    throw new ReceiveTextError('正文无法按声明的文本编码读取', { cause })
  }
}
