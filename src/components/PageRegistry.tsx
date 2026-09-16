import type { ComponentType } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { matchPath, useLocation, useNavigationType } from 'react-router-dom'
import { applyNavigation, createNavStack } from '../lib/navStack.ts'
import AccountPage from '../pages/AccountPage.tsx'
import AddDosePage from '../pages/AddDosePage.tsx'
import AddFoodPage from '../pages/AddFoodPage.tsx'
import AddRecipePage from '../pages/AddRecipePage.tsx'
import CalendarPage from '../pages/CalendarPage.tsx'
import DailyDosesPage from '../pages/DailyDosesPage.tsx'
import DashboardPage from '../pages/DashboardPage.tsx'
import EditDosePage from '../pages/EditDosePage.tsx'
import EditFoodPage from '../pages/EditFoodPage.tsx'
import EditMealPage from '../pages/EditMealPage.tsx'
import EditRecipePage from '../pages/EditRecipePage.tsx'
import GroupDetailPage from '../pages/GroupDetailPage.tsx'
import InventoryPage from '../pages/InventoryPage.tsx'
import MyFoodsPage from '../pages/MyFoodsPage.tsx'
import MyRecipesPage from '../pages/MyRecipesPage.tsx'
import NetworkPage from '../pages/NetworkPage.tsx'
import PlanMealPage from '../pages/PlanMealPage.tsx'
import RedeemConnectPage from '../pages/RedeemConnectPage.tsx'
import SettingsPage from '../pages/SettingsPage.tsx'
import ShoppingListPage from '../pages/ShoppingListPage.tsx'
import ViewRecipePage from '../pages/ViewRecipePage.tsx'

/** Every gated route, in the same order `App.tsx` used to declare them. Order has no effect on which one is shown (`matchPath` picks the one matching the current path), kept only for readability/diffability. */
const GATED_PAGES: { pattern: string; Component: ComponentType }[] = [
  { pattern: '/dashboard', Component: DashboardPage },
  { pattern: '/account', Component: AccountPage },
  { pattern: '/settings', Component: SettingsPage },
  { pattern: '/add-food', Component: AddFoodPage },
  { pattern: '/foods', Component: MyFoodsPage },
  { pattern: '/foods/:foodId/edit', Component: EditFoodPage },
  { pattern: '/plan-meal', Component: PlanMealPage },
  { pattern: '/calendar', Component: CalendarPage },
  { pattern: '/shopping-list', Component: ShoppingListPage },
  { pattern: '/inventory', Component: InventoryPage },
  { pattern: '/doses', Component: DailyDosesPage },
  { pattern: '/doses/add', Component: AddDosePage },
  { pattern: '/doses/:doseId/edit', Component: EditDosePage },
  { pattern: '/meals/:mealId/edit', Component: EditMealPage },
  { pattern: '/add-recipe', Component: AddRecipePage },
  { pattern: '/recipes', Component: MyRecipesPage },
  { pattern: '/recipes/:recipeId', Component: ViewRecipePage },
  { pattern: '/recipes/:recipeId/edit', Component: EditRecipePage },
  { pattern: '/network', Component: NetworkPage },
  { pattern: '/connect/:code', Component: RedeemConnectPage },
  { pattern: '/groups/:groupId', Component: GroupDetailPage },
]

/** How long the slide transition's CSS `transition: transform` runs — kept in sync with the duration in pages.css's `.page-registry-slot--sliding` rule. */
const TRANSITION_MS = 320

type SlideTransition = {
  from: string
  to: string
  direction: 'back' | 'forward'
  phase: 'start' | 'run'
}

/**
 * The transform for one of the two slots involved in a slide transition.
 * 'to' (the page being navigated to) starts just off-screen on the side its
 * direction implies and slides to 0; 'from' (the page being left) starts at
 * 0 and slides off-screen the opposite way — so the two slots always meet
 * edge-to-edge with no overlap or gap, in either direction.
 */
function slotTransform(
  role: 'from' | 'to',
  direction: 'back' | 'forward',
  phase: 'start' | 'run',
): string {
  if (role === 'to') {
    if (phase === 'run') return 'translateX(0)'
    return direction === 'back' ? 'translateX(-100%)' : 'translateX(100%)'
  }
  if (phase === 'start') return 'translateX(0)'
  return direction === 'back' ? 'translateX(100%)' : 'translateX(-100%)'
}

function activePatternFor(pathname: string): string | null {
  return GATED_PAGES.find(({ pattern }) => matchPath(pattern, pathname))?.pattern ?? null
}

/**
 * Mounts every gated page once, for the life of the authenticated session,
 * and toggles which one is visible via the native `hidden` attribute
 * (see `.page-registry-slot` in pages.css) instead of React Router
 * mounting/unmounting them on navigation — so in-progress local state
 * (unsaved form edits, scroll position, live Firestore listeners) survives
 * navigating away and back. `matchPath` is a standalone pure function, so
 * this works without these pages being rendered inside an actively-matched
 * `<Routes>`/`<Route>` (see `hooks/useRouteParam.ts`, which the pages
 * needing a route param use in place of `useParams()` for the same reason).
 *
 * On top of that, every navigation that actually changes page briefly
 * unhides BOTH the outgoing and incoming pages and slides them past each
 * other, instead of the usual instant hidden/shown swap. A POP navigation
 * (browser back/forward, or BackButton/ForwardButton — see NavHistoryContext)
 * slides in whichever direction it actually moved through history; a
 * PUSH/REPLACE (a normal `<Link>` click, a form redirecting after saving)
 * has no such direction of its own, so it slides the same way stepping
 * forward does — the new page arrives from the right.
 *
 * The direction is tracked with its own local nav stack (lib/navStack.ts)
 * rather than read from NavHistoryContext: that context updates a render
 * behind `location.pathname` (fine for BackButton/ForwardButton, which sit
 * outside PageRegistry — see its own comment), but the transition here needs
 * the direction to land in the *same* effect run as `activePattern`, so both
 * are always derived from this component's own render.
 */
function PageRegistry() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const activePattern = activePatternFor(location.pathname)

  const stackRef = useRef(createNavStack(location.key))
  const hasMountedRef = useRef(false)
  const prevPatternRef = useRef(activePattern)
  const [transition, setTransition] = useState<SlideTransition | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  // useLayoutEffect, not useEffect: this needs to land *before* the browser
  // paints. `activePattern` already flips to the new page in this same
  // render (that's what drives the plain isActive/hidden branch below), so
  // a plain useEffect — which runs after paint — would let the browser show
  // one frame of the instant, un-transitioned swap first, then jump the
  // destination page off-screen to its 'start' position and slide it back
  // in. Setting `transition` before paint means the very first frame the
  // browser shows already has both slots at their slide-start position, so
  // the swap is never visible un-transitioned.
  useLayoutEffect(() => {
    const prevPattern = prevPatternRef.current
    prevPatternRef.current = activePattern

    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    const popDirection = applyNavigation(stackRef.current, navigationType, location.key)
    if (!activePattern || !prevPattern || activePattern === prevPattern) {
      return
    }
    // A PUSH/REPLACE (or an untracked POP — see applyNavigation's own
    // comment) has no meaningful back/forward direction of its own; treat it
    // as 'forward' so landing on a new page still slides in from the right,
    // the same way stepping forward through history already does.
    const direction = popDirection ?? 'forward'

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    setTransition({ from: prevPattern, to: activePattern, direction, phase: 'start' })

    // Two rAFs, not one: the browser needs to actually paint the 'start'
    // (off-screen) position before flipping to 'run' triggers the CSS
    // transition — a single rAF can still land before that paint happens,
    // which would make the slide jump straight to its end state instead of
    // animating.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setTransition((current) => (current ? { ...current, phase: 'run' } : current))
        timeoutRef.current = setTimeout(() => setTransition(null), TRANSITION_MS)
      })
    })
  }, [activePattern, location.key, navigationType])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  return (
    <div className="page-registry-viewport">
      {GATED_PAGES.map(({ pattern, Component }) => {
        if (transition && (transition.from === pattern || transition.to === pattern)) {
          const role = transition.to === pattern ? 'to' : 'from'
          return (
            <div
              key={pattern}
              className="page-registry-slot page-registry-slot--sliding"
              style={{
                transform: slotTransform(role, transition.direction, transition.phase),
                zIndex: role === 'to' ? 2 : 1,
              }}
            >
              <Component />
            </div>
          )
        }

        const isActive = pattern === activePattern
        return (
          <div key={pattern} hidden={!isActive} className="page-registry-slot">
            <Component />
          </div>
        )
      })}
    </div>
  )
}

export default PageRegistry
