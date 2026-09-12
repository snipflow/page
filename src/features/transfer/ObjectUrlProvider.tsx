import { createElement, type ReactNode } from 'react'
import { ObjectUrlContext } from './object-url-context.ts'
import { ObjectUrlRegistry } from './object-url-registry.ts'

export function ObjectUrlProvider({
  children,
  registry,
}: {
  children: ReactNode
  registry: ObjectUrlRegistry
}) {
  return createElement(ObjectUrlContext.Provider, { value: registry }, children)
}
