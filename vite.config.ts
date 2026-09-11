import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { parseMaxObjectBytes } from './src/domain/validation.ts'
import { parseAuthIdleTtlSeconds } from './src/features/auth/auth-cache.ts'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = env.SNIPFLOW_API_ORIGIN
  parseMaxObjectBytes(env.VITE_MAX_OBJECT_BYTES)
  parseAuthIdleTtlSeconds(env.VITE_AUTH_IDLE_TTL_SECONDS)

  if (command === 'serve' && !apiOrigin) {
    throw new Error(
      'SNIPFLOW_API_ORIGIN is required when starting the development server',
    )
  }

  return {
    server: {
      port: 10010,
      strictPort: true,
      ...(apiOrigin
        ? {
            proxy: {
              '/health': { target: apiOrigin, changeOrigin: true },
              '/snip': { target: apiOrigin, changeOrigin: true },
              '/stats': { target: apiOrigin, changeOrigin: true },
            },
          }
        : {}),
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
