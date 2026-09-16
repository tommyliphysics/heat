import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import AccountMenu from './AccountMenu.tsx'
import BackButton from './BackButton.tsx'
import BrandMark from './BrandMark.tsx'
import DoseAlertBanners from './DoseAlertBanners.tsx'
import ForwardButton from './ForwardButton.tsx'
import Icon from './Icon.tsx'
import MoreMenu from './MoreMenu.tsx'
import { NAV_LINKS } from '../lib/navLinks.ts'

type AppNavProps = {
  children: ReactNode
}

/**
 * The app's persistent navigation chrome, wrapping every authenticated
 * page (see `AuthenticatedShell`) — a left sidebar with every section link
 * on wide/browser viewports, or a bottom tab bar (Account / Home / More) on
 * narrow/mobile ones, switching purely by CSS media query so both are
 * always in the DOM.
 */
function AppNav({ children }: AppNavProps) {
  return (
    <div className="app-shell">
      <div className="app-shell-body">
        <nav className="app-sidebar" aria-label="Main navigation">
          <NavLink to="/dashboard" className="app-sidebar-brand">
            <BrandMark size={18} />
            Heat
          </NavLink>

          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `app-sidebar-link${isActive ? ' app-sidebar-link-active' : ''}`
              }
            >
              <Icon name={link.icon} size={17} />
              {link.label}
            </NavLink>
          ))}

          <div className="app-sidebar-spacer" />

          <AccountMenu variant="sidebar" />
        </nav>

        <div className="app-shell-main">
          <DoseAlertBanners />
          <div className="app-shell-nav-row">
            <BackButton />
            <ForwardButton />
          </div>
          {children}
        </div>
      </div>

      <nav className="app-bottom-nav" aria-label="Main navigation">
        <AccountMenu variant="bottom-nav" />
        <NavLink to="/dashboard" className="app-bottom-nav-tab">
          <Icon name="home" size={19} />
          Home
        </NavLink>
        <MoreMenu />
      </nav>
    </div>
  )
}

export default AppNav
