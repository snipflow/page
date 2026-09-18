import '@testing-library/jest-dom/vitest'
import { apiServer } from './msw-server.ts'

if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined
  window.matchMedia = (query) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList
}

beforeAll(() => apiServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => apiServer.resetHandlers())
afterAll(() => apiServer.close())
