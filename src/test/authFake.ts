import { vi } from 'vitest'
import type { User } from 'firebase/auth'

/**
 * A minimal stand-in for the `firebase/auth` functions this app uses.
 * Wired up globally in `src/test/setup.ts` via `vi.mock('firebase/auth', ...)`.
 *
 * Most of the mutating flows below (sign-in, link/unlink providers,
 * password/email changes, reauthentication) are plain no-op stubs — no
 * current test exercises them. A test that does should replace the
 * relevant stub's implementation (e.g. `vi.mocked(signInWithEmailAndPassword).mockResolvedValueOnce(...)`)
 * rather than relying on the default here.
 */

export type FakeAuth = { currentUser: User | null }
export const auth: FakeAuth = { currentUser: null }

type AuthStateListener = (user: User | null) => void
const authStateListeners = new Set<AuthStateListener>()
const idTokenListeners = new Set<AuthStateListener>()

export const getAuth = vi.fn((): FakeAuth => auth)

export class GoogleAuthProvider {}
export class EmailAuthProvider {
  static credential(email: string, password: string) {
    return { email, password, providerId: 'password' }
  }
}

export const onAuthStateChanged = vi.fn(
  (_auth: FakeAuth, callback: AuthStateListener) => {
    authStateListeners.add(callback)
    callback(auth.currentUser)
    return () => authStateListeners.delete(callback)
  },
)

export const onIdTokenChanged = vi.fn(
  (_auth: FakeAuth, callback: AuthStateListener) => {
    idTokenListeners.add(callback)
    callback(auth.currentUser)
    return () => idTokenListeners.delete(callback)
  },
)

export const signOut = vi.fn(async () => {
  setCurrentUser(null)
})

export const signInWithEmailAndPassword = vi.fn(async () => ({
  user: auth.currentUser,
}))
export const createUserWithEmailAndPassword = vi.fn(async () => ({
  user: auth.currentUser,
}))
export const signInWithPopup = vi.fn(async () => ({ user: auth.currentUser }))
export const sendEmailVerification = vi.fn(async () => {})
export const linkWithCredential = vi.fn(async () => ({ user: auth.currentUser }))
export const linkWithPopup = vi.fn(async () => ({ user: auth.currentUser }))
export const unlink = vi.fn(async () => auth.currentUser)
export const updateEmail = vi.fn(async () => {})
export const updatePassword = vi.fn(async () => {})
export const reauthenticateWithCredential = vi.fn(async () => ({
  user: auth.currentUser,
}))
export const reauthenticateWithPopup = vi.fn(async () => ({
  user: auth.currentUser,
}))

// --- test-facing helpers (not part of the firebase/auth surface) ---

/** Sets the signed-in user and notifies both onAuthStateChanged and onIdTokenChanged listeners, like a real sign-in/out would. */
export function setCurrentUser(user: User | null) {
  auth.currentUser = user
  for (const callback of authStateListeners) callback(user)
  for (const callback of idTokenListeners) callback(user)
}

/** A bare-minimum fake `User` — enough for `.uid`/`.email`/`.emailVerified` checks; spread in overrides for anything else a test needs. */
export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    emailVerified: true,
    providerData: [],
    ...overrides,
  } as User
}

export function resetAuthFake() {
  auth.currentUser = null
  authStateListeners.clear()
  idTokenListeners.clear()
  for (const fn of [
    getAuth,
    onAuthStateChanged,
    onIdTokenChanged,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    sendEmailVerification,
    linkWithCredential,
    linkWithPopup,
    unlink,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
  ]) {
    fn.mockClear()
  }
}
