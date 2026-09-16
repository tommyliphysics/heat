import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from './Icon.tsx'
import { NAV_LINKS } from '../lib/navLinks.ts'

/** Mobile bottom nav's "More" tab — opens the same section links the desktop sidebar shows directly. */
function MoreMenu() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="account-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="app-bottom-nav-tab"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <Icon name="menu" size={19} />
        More
      </button>

      {open && (
        <div className="account-menu">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className="account-menu-item"
              onClick={() => setOpen(false)}
            >
              <Icon name={link.icon} size={15} />
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default MoreMenu
