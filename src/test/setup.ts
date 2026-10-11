// Loaded before every `npm test` file (vite.config.ts → test.setupFiles).
// Adds DOM matchers such as toBeInTheDocument(). RTL cleans up after each test
// automatically because Vitest globals are on.
import '@testing-library/jest-dom/vitest'
