import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The default 5s is too tight for App.test.tsx: every gated page (18 of
    // them, full Firestore-backed components) mounts simultaneously for
    // each test, which is inherently heavier than a typical unit test even
    // under normal load.
    testTimeout: 15000,
  },
})
