import { sanitizeFilename } from '../../domain/index.ts'

export class ObjectUrlRegistry {
  private readonly urls = new Set<string>()

  create(blob: Blob) {
    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }

  revoke(url: string) {
    if (!this.urls.delete(url)) return
    URL.revokeObjectURL(url)
  }

  revokeAll() {
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
  }
}

export function triggerBlobDownload(
  registry: ObjectUrlRegistry,
  blob: Blob,
  filename: string,
) {
  const url = registry.create(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = sanitizeFilename(filename)
  anchor.rel = 'noopener'
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  globalThis.setTimeout(() => registry.revoke(url), 1_000)
}
