export function snipBodyQueryKey(sessionId: string, key: string) {
  return ['session', sessionId, 'snip', key, 'body'] as const
}

export function createSnipMutationKey(sessionId: string) {
  return ['session', sessionId, 'snip', 'create'] as const
}

export function deleteSnipMutationKey(sessionId: string, key: string) {
  return ['session', sessionId, 'snip', key, 'delete'] as const
}
