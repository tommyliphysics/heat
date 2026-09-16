import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase.ts'
import Icon from './Icon.tsx'

type AccountMenuProps = {
  /** `sidebar` renders the trigger as a full-width row matching the other desktop sidebar links; `bottom-nav` renders it as a small icon-over-label tab matching the mobile bottom nav's other tabs. */
  variant: 'sidebar' | 'bottom-nav'
}

function AccountMenu({ variant }: AccountMenuProps) {
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
        className={variant === 'sidebar' ? 'app-sidebar-link' : 'app-bottom-nav-tab'}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <Icon name="user" size={variant === 'sidebar' ? 17 : 19} />
        Account
      </button>

      {open && (
        <div className="account-menu">
          <Link
            to="/account"
            className="account-menu-item"
            onClick={() => setOpen(false)}
          >
            <Icon name="user" size={15} />
            My Details
          </Link>
          <Link
            to="/settings"
            className="account-menu-item"
            onClick={() => setOpen(false)}
          >
            <Icon name="settings" size={15} />
            Settings
          </Link>
          <button
            type="button"
            className="account-menu-item account-menu-item-button"
            onClick={() => signOut(auth)}
          >
            <Icon name="logout" size={15} />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default AccountMenu
