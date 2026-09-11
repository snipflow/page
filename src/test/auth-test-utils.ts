import type { AuthStorage } from '../features/auth/auth-cache.ts'

export class MemoryAuthStorage implements AuthStorage {
  readonly values = new Map<string, string>()
  failReads = false
  failRemoves = false
  failWrites = false

  getItem(key: string) {
    if (this.failReads) {
      throw new DOMException('Storage unavailable', 'SecurityError')
    }
    return this.values.get(key) ?? null
  }

  removeItem(key: string) {
    if (this.failRemoves) {
      throw new DOMException('Storage unavailable', 'SecurityError')
    }
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    if (this.failWrites) {
      throw new DOMException('Storage unavailable', 'QuotaExceededError')
    }
    this.values.set(key, value)
  }
}
