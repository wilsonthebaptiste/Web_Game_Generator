import { defineConfig } from 'vitest/config'

// Database tests run against a local Supabase stack (`npx supabase start`, needs Docker).
// They are kept out of `npm test` so CI and day-to-day runs don't need Docker.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    passWithNoTests: true,
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
