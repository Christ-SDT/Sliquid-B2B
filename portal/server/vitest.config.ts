import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      // src/scripts/** are one-off ops entrypoints that call main() at import
      // time — same reason src/index.ts is excluded. No logic belongs in them.
      exclude: ['src/__tests__/**', 'src/index.ts', 'src/scripts/**'],
    },
  },
})
