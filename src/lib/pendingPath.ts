/**
 * Remembers a path someone was trying to reach (e.g. a connect-code link)
 * when `AuthenticatedShell` bounced them to sign in/up first, so the various
 * post-auth navigations (LoginPage, CreateAccountPage's Google branch,
 * VerifyEmailPage) can send them there instead of always landing on
 * `/dashboard`. Session-scoped, not `localStorage` — a stale pending path
 * should never resurrect itself in some unrelated future session, and this
 * only ever needs to survive the current tab's sign-in/sign-up/verify steps.
 */
const KEY = 'pendingPath'

export function savePendingPath(path: string): void {
  if (!path || path === '/') return
  sessionStorage.setItem(KEY, path)
}

/** Reads and clears the pending path in one step — it's a one-time destination, not a standing redirect. Falls back to `/dashboard`, today's default for every sign-in/sign-up flow. */
export function takePendingPath(): string {
  const path = sessionStorage.getItem(KEY)
  if (path) sessionStorage.removeItem(KEY)
  return path || '/dashboard'
}
