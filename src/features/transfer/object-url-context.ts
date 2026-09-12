import { createContext } from 'react'
import type { ObjectUrlRegistry } from './object-url-registry.ts'

export const ObjectUrlContext = createContext<ObjectUrlRegistry | null>(null)
