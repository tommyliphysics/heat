import type { IconName } from '../components/Icon.tsx'

export type NavLink = {
  to: string
  label: string
  icon: IconName
}

/** The app's primary sections — the desktop sidebar, and the mobile bottom nav's "More" menu. */
export const NAV_LINKS: NavLink[] = [
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/shopping-list', label: 'Shopping List', icon: 'cart' },
  { to: '/inventory', label: 'Inventory', icon: 'box' },
  { to: '/doses', label: 'Daily Doses', icon: 'pill' },
  { to: '/foods', label: 'Foods', icon: 'leaf' },
  { to: '/recipes', label: 'Recipes', icon: 'book' },
  { to: '/network', label: 'Network', icon: 'users' },
]
