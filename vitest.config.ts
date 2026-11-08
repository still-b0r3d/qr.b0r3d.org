import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // the round trips through the scanner take a moment each
    testTimeout: 30_000
  }
})
