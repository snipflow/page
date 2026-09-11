import { setupServer } from 'msw/node'
import { apiHandlers } from './msw-handlers.ts'

export const apiServer = setupServer(...apiHandlers)
