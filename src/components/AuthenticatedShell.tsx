import { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import AppNav from './AppNav.tsx'
import PageRegistry from './PageRegistry.tsx'
import { NavHistoryProvider } from '../contexts/NavHistoryContext.tsx'
import useAuthUser from '../hooks/useAuthUser.ts'
import { useGroupWatchers } from '../hooks/useGroupWatchers.ts'
import { reconcileInventory } from '../lib/inventoryReconcile.ts'
import { savePendingPath } from '../lib/pendingPath.ts'

/**
 * The single mount point for the whole authenticated app (see `App.tsx`'s
 * `/*` catch-all route) — replaces the old per-route `RequireAuth` wrapper,
 * which was instantiated once per `<Route>` and therefore remounted (along
 * with `AppNav`, `DoseAlertBanners`, every gated page) on every navigation.
 * This component mounts exactly once per authenticated session; `AppNav`
 * and `PageRegistry` (which keeps every gated page permanently mounted,
 * toggling visibility instead of unmounting) below it do too.
 */
function AuthenticatedShell() {
  const { user, checked } = useAuthUser()
  const location = useLocation()

  // A plain ref (not the module-level variable `RequireAuth` used) is
  // enough now that this component genuinely mounts once per session — no
  // longer needs to survive a remount.
  const reconciledForUid = useRef<string | null>(null)

  useEffect(() => {
    if (!user?.emailVerified) return
    if (reconciledForUid.current === user.uid) return
    reconciledForUid.current = user.uid

    reconcileInventory(user.uid).catch((err) => {
      console.error('Inventory reconciliation failed', err)
    })
  }, [user])

  useGroupWatchers()

  if (!checked) return null
  if (!user) {
    // A deep link (e.g. a connect-code invite) reaching this gate signed
    // out — remembered so LoginPage/CreateAccountPage/VerifyEmailPage can
    // send them back here once they've actually signed in, instead of
    // always dropping them on /dashboard having lost the reason they came.
    savePendingPath(location.pathname)
    return <Navigate to="/" replace />
  }
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />

  return (
    <NavHistoryProvider>
      <AppNav>
        <PageRegistry />
      </AppNav>
    </NavHistoryProvider>
  )
}

export default AuthenticatedShell
