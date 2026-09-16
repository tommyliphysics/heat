import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { resetAuthFake } from './authFake.ts'
import { resetFirestoreFake } from './firestoreFake.ts'

// Applies to every test file: `../firebase.ts` (imported directly or
// transitively by almost every page/component) calls these at module load
// time, so real Firebase must never be reachable in tests — see
// `authFake.ts` / `firestoreFake.ts` for what's actually faked.
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase/analytics', () => ({
  isSupported: vi.fn(async () => false),
  getAnalytics: vi.fn(() => ({})),
}))

vi.mock('firebase/auth', () => import('./authFake.ts'))
vi.mock('firebase/firestore', () => import('./firestoreFake.ts'))

// jsdom doesn't implement scroll APIs at all — pages that call
// `element.scrollIntoView()` (e.g. CalendarPage) would otherwise throw
// "not a function" in any test that renders them, which has nothing to do
// with the app itself.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

afterEach(() => {
  cleanup()
  resetFirestoreFake()
  resetAuthFake()
})
