import '@testing-library/jest-dom/vitest'
import { apiServer } from './msw-server.ts'

if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined
}

beforeAll(() => apiServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => apiServer.resetHandlers())
afterAll(() => apiServer.close())
