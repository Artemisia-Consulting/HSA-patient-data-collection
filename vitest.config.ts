import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Shared Vitest config.
 *
 * MERGE NOTE (Stream 1): all three streams need a config for the `@/` alias,
 * so this file is likely to collide. It is deliberately generic — node
 * environment, `tests/**` only, `@` → `src`. A frontend test that needs a DOM
 * should opt in per file with `// @vitest-environment jsdom` rather than
 * changing the global environment, which would break the backend suite.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Each backend test file builds its own in-memory database, so files are
    // safe to run in parallel.
    restoreMocks: true,
  },
})
