import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { applyNavigation, createNavStack } from '../lib/navStack.ts'
import { NavHistoryContext, type NavHistoryValue } from '../hooks/useNavHistory.ts'

/**
 * Tracks the authenticated app's own in-session navigation stack, since
 * neither the DOM History API nor react-router expose "is there a forward
 * entry" directly (see lib/navStack.ts for the bookkeeping itself).
 *
 * A plain effect: this only feeds `canGoBack`/`canGoForward`/`popDirection`
 * to BackButton/ForwardButton/the swipe hook, all of which sit outside
 * `PageRegistry` — being a render behind `location.pathname` here is
 * imperceptible (the Forward button appearing a frame late). PageRegistry
 * keeps its own separate stack instance, computed synchronously alongside
 * its own `activePattern` in the same effect, specifically so the slide
 * transition never needs this context to be perfectly in sync with page
 * content — see PageRegistry.tsx's comment for why that distinction matters.
 *
 * A hard refresh resets this (react-router reports the reloaded location as
 * a fresh 'default'-keyed entry) even though the real browser tab may have
 * prior history — `canGoBack`/`canGoForward` come back `false` until the
 * user navigates again from there. Acceptable: nothing else in this app
 * tries to be clever about history that predates the current load either.
 */
export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const stackRef = useRef(createNavStack(location.key))
  const hasMountedRef = useRef(false)
  const [value, setValue] = useState<NavHistoryValue>({
    canGoBack: false,
    canGoForward: false,
    popDirection: null,
  })

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    const stack = stackRef.current
    const popDirection = applyNavigation(stack, navigationType, location.key)

    setValue({
      canGoBack: stack.index > 0,
      canGoForward: stack.index < stack.keys.length - 1,
      popDirection,
    })
  }, [location.key, navigationType])

  return (
    <NavHistoryContext.Provider value={value}>
      {children}
    </NavHistoryContext.Provider>
  )
}
