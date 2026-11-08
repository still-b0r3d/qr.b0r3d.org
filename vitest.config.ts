import { defineConfig } from 'vitest/config'

// Events' times are local: the tests run in New York's time zone (it has summer time), the zone the
// PC app's answers in src/test/pc-app-templates.json were made in.
process.env.TZ = 'America/New_York'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // the round trips through the scanner take a moment each
    testTimeout: 30_000
  }
})
