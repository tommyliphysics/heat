import { useRef } from 'react'
import { matchPath, useLocation } from 'react-router-dom'

/**
 * Reads one path param by matching `pattern` against the current location
 * — a `useParams()` replacement for pages that are permanently mounted as
 * siblings (see `PageRegistry.tsx`) rather than rendered by an actively
 * matched `<Route>`, since `useParams()` only resolves inside one.
 * `matchPath` is a standalone pure function, so this works without route
 * context.
 *
 * Freezes at the last successful match instead of going back to `undefined`
 * once the page is no longer the active route: `useLocation()` is global,
 * so every permanently-mounted page re-renders on every navigation, not
 * just the one becoming visible — without freezing, a hidden Edit page's
 * param would flip to `undefined` the moment the user navigates elsewhere,
 * changing whatever `key` a caller derives from it (see `EditFoodPage`
 * etc.) and silently discarding an in-progress edit on the very next
 * navigation, which is exactly the bug this hook exists to prevent.
 */
export function useRouteParam(pattern: string, paramName: string): string | undefined {
  const location = useLocation()
  const match = matchPath(pattern, location.pathname)
  const lastValue = useRef<string | undefined>(undefined)
  if (match) {
    lastValue.current = match.params[paramName]
  }
  return lastValue.current
}
