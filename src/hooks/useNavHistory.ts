import { createContext, useContext } from 'react'

export type PopDirection = 'back' | 'forward' | null

export type NavHistoryValue = {
  canGoBack: boolean
  canGoForward: boolean
  /**
   * Direction of the most recent POP (browser back/forward, `navigate(-1)`/
   * `navigate(1)` from BackButton/ForwardButton/a swipe, or the OS's own
   * back gesture) — `null` immediately after a PUSH/REPLACE, or before the
   * first POP this session. Not used by PageRegistry's slide transition
   * (it computes its own direction locally, see PageRegistry.tsx); kept
   * here for any other consumer that only needs "which way," a render or
   * two behind page content.
   */
  popDirection: PopDirection
}

export const NavHistoryContext = createContext<NavHistoryValue>({
  canGoBack: false,
  canGoForward: false,
  popDirection: null,
})

export function useNavHistory(): NavHistoryValue {
  return useContext(NavHistoryContext)
}
