import { useEffect, useRef, useState } from 'react'
import './AppHeaderMenu.css'

export default function AppHeaderMenu({ onNavigate, onLogout }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = view => {
    setOpen(false)
    onNavigate?.(view)
  }

  const logout = () => {
    setOpen(false)
    onLogout?.()
  }

  return (
    <div className="app-header-menu" ref={rootRef}>
      <button
        type="button"
        className="app-header-menu__trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen(v => !v)}
      >
        <span className="app-header-menu__hamburger" aria-hidden>
          <span className="app-header-menu__bar" />
          <span className="app-header-menu__bar" />
          <span className="app-header-menu__bar" />
        </span>
      </button>
      {open && (
        <ul className="app-header-menu__list" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="app-header-menu__item"
              onClick={() => pick('account')}
            >
              Account
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="app-header-menu__item"
              onClick={() => pick('opening-trainer')}
            >
              Opening Trainer
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="app-header-menu__item"
              onClick={() => pick('settings')}
            >
              Settings
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="app-header-menu__item"
              onClick={() => pick('weakness-profile')}
            >
              Weakness Profile
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="app-header-menu__item"
              onClick={() => pick('endgame-practice')}
            >
              Endgame Practice
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="app-header-menu__item"
              onClick={logout}
            >
              Log out
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
