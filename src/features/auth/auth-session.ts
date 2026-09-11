import {
  AUTH_STORAGE_KEY,
  type AuthStorage,
  isCachedAuthExpired,
  isValidAuthToken,
  parseCachedAuthRecord,
  serializeCachedAuthRecord,
} from './auth-cache.ts'

export const FUNCTIONAL_PATHS = ['/send', '/receive', '/dashboard'] as const
export type FunctionalPath = (typeof FUNCTIONAL_PATHS)[number]
export type AuthPersistence = 'local' | 'memory' | 'none'

export interface AuthSessionSnapshot {
  status: 'anonymous' | 'authenticated'
  sessionId: string | null
  persistence: AuthPersistence
  storageAvailable: boolean
}

export interface CreateAuthSessionOptions {
  storage: AuthStorage | null
  idleTtlSeconds: number
  now?: () => number
  createSessionId?: () => string
}

type SessionCleanup = () => void
type SessionListener = () => void

function defaultSessionId() {
  return globalThis.crypto.randomUUID()
}

export function isFunctionalPath(value: string): value is FunctionalPath {
  return FUNCTIONAL_PATHS.some((path) => path === value)
}

export class AuthSession {
  readonly idleTtlSeconds: number

  private storage: AuthStorage | null
  private readonly now: () => number
  private readonly createSessionId: () => string
  private readonly listeners = new Set<SessionListener>()
  private readonly cleanupCallbacks = new Set<SessionCleanup>()
  private token: string | null = null
  private target: FunctionalPath | null = null
  private snapshot: AuthSessionSnapshot

  constructor({
    storage,
    idleTtlSeconds,
    now = Date.now,
    createSessionId = defaultSessionId,
  }: CreateAuthSessionOptions) {
    this.storage = storage
    this.idleTtlSeconds = idleTtlSeconds
    this.now = now
    this.createSessionId = createSessionId
    this.snapshot = this.anonymousSnapshot()
    this.restoreCachedSession()
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: SessionListener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getToken = () => this.token

  getSessionId = () => this.snapshot.sessionId

  isAuthenticated() {
    return this.snapshot.status === 'authenticated'
  }

  rememberTarget(path: FunctionalPath) {
    this.target = path
  }

  consumeTarget(fallback: FunctionalPath = '/send') {
    const target = this.target ?? fallback
    this.target = null
    return target
  }

  registerCleanup(cleanup: SessionCleanup) {
    this.cleanupCallbacks.add(cleanup)
    return () => {
      this.cleanupCallbacks.delete(cleanup)
    }
  }

  establishSession(token: string): AuthPersistence {
    if (!isValidAuthToken(token)) {
      throw new TypeError('A valid runtime token is required')
    }

    if (this.isAuthenticated()) {
      this.runCleanups()
    }

    const lastActiveAt = this.now()
    let persistence: AuthPersistence = 'memory'
    if (this.storage) {
      try {
        this.storage.setItem(
          AUTH_STORAGE_KEY,
          serializeCachedAuthRecord({ token, lastActiveAt }),
        )
        persistence = 'local'
      } catch {
        this.storage = null
      }
    }

    this.token = token
    this.snapshot = {
      status: 'authenticated',
      sessionId: this.createSessionId(),
      persistence,
      storageAvailable: this.storage !== null,
    }
    this.emit()
    return persistence
  }

  endSession(options?: {
    expectedSessionId?: string
    preserveStorage?: boolean
    target?: FunctionalPath
  }) {
    if (
      options?.expectedSessionId !== undefined &&
      options.expectedSessionId !== this.snapshot.sessionId
    ) {
      return false
    }

    if (options?.target) {
      this.rememberTarget(options.target)
    }
    if (this.isAuthenticated()) {
      this.runCleanups()
    }
    if (!options?.preserveStorage) {
      this.removeCachedSession()
    }

    const changed = this.isAuthenticated() || this.token !== null
    this.token = null
    this.snapshot = this.anonymousSnapshot()
    if (changed) {
      this.emit()
    }
    return true
  }

  endSessionIfCurrent(sessionId: string) {
    return this.endSession({ expectedSessionId: sessionId })
  }

  touch() {
    if (!this.token || !this.isAuthenticated()) {
      return false
    }

    const lastActiveAt = this.now()
    if (!this.storage || this.snapshot.persistence === 'memory') {
      return true
    }

    let cachedValue: string | null
    try {
      cachedValue = this.storage.getItem(AUTH_STORAGE_KEY)
    } catch {
      this.fallBackToMemory()
      return true
    }

    if (cachedValue === null) {
      this.endSession({ preserveStorage: true })
      return false
    }

    const cached = parseCachedAuthRecord(cachedValue)
    if (!cached) {
      this.removeCachedSession()
      this.endSession({ preserveStorage: true })
      return false
    }

    if (cached.token !== this.token) {
      this.handleStorageValue(cachedValue)
      if (!this.token || !this.isAuthenticated()) {
        return false
      }
    }

    try {
      this.storage?.setItem(
        AUTH_STORAGE_KEY,
        serializeCachedAuthRecord({ token: this.token, lastActiveAt }),
      )
    } catch {
      this.fallBackToMemory()
    }
    return true
  }

  handleStorageValue(value: string | null) {
    if (value === null) {
      return this.endSession({ preserveStorage: true })
    }

    const record = parseCachedAuthRecord(value)
    if (
      !record ||
      isCachedAuthExpired(record, this.now(), this.idleTtlSeconds)
    ) {
      this.removeCachedSession()
      return this.endSession({ preserveStorage: true })
    }

    if (record.token === this.token && this.isAuthenticated()) {
      return true
    }

    if (this.isAuthenticated()) {
      this.runCleanups()
    }
    this.token = record.token
    this.snapshot = {
      status: 'authenticated',
      sessionId: this.createSessionId(),
      persistence: 'local',
      storageAvailable: this.storage !== null,
    }
    this.emit()
    return true
  }

  private anonymousSnapshot(): AuthSessionSnapshot {
    return {
      status: 'anonymous',
      sessionId: null,
      persistence: 'none',
      storageAvailable: this.storage !== null,
    }
  }

  private restoreCachedSession() {
    if (!this.storage) {
      return
    }

    let value: string | null
    try {
      value = this.storage.getItem(AUTH_STORAGE_KEY)
    } catch {
      this.storage = null
      this.snapshot = this.anonymousSnapshot()
      return
    }
    if (value === null) {
      return
    }

    const record = parseCachedAuthRecord(value)
    if (
      !record ||
      isCachedAuthExpired(record, this.now(), this.idleTtlSeconds)
    ) {
      this.removeCachedSession()
      return
    }

    this.token = record.token
    this.snapshot = {
      status: 'authenticated',
      sessionId: this.createSessionId(),
      persistence: 'local',
      storageAvailable: true,
    }
  }

  private fallBackToMemory() {
    this.storage = null
    this.snapshot = {
      ...this.snapshot,
      persistence: this.isAuthenticated() ? 'memory' : 'none',
      storageAvailable: false,
    }
    this.emit()
  }

  private removeCachedSession() {
    if (!this.storage) {
      return
    }
    try {
      this.storage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      this.storage = null
    }
  }

  private runCleanups() {
    for (const cleanup of this.cleanupCallbacks) {
      try {
        cleanup()
      } catch {
        // A cleanup failure must not keep credentials or the old session alive.
      }
    }
  }

  private emit() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
