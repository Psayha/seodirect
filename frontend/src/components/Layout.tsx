import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { usePushNotifications } from '../hooks/usePushNotifications'

// ── Inline SVG icon component ─────────────────────────────────────────────────
function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const PATHS = {
  projects: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 3v4 M16 3v4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  users:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  trash:    'M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2',
  sun:      'M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 5a7 7 0 100 14A7 7 0 0012 5z',
  moon:     'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  bell:     'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
  logout:   'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
  menu:     'M3 12h18 M3 6h18 M3 18h18',
  close:    'M18 6L6 18 M6 6l12 12',
}

const NAV = [
  { to: '/projects',    icon: 'projects', label: 'Проекты',      roles: ['super_admin','admin','specialist','viewer'] },
  { to: '/settings',   icon: 'settings', label: 'Настройки',    roles: ['super_admin','admin','specialist'] },
  { to: '/admin/users',icon: 'users',    label: 'Пользователи', roles: ['super_admin','admin'] },
  { to: '/trash',      icon: 'trash',    label: 'Корзина',      roles: ['super_admin','admin'] },
]

// ── Icon strip (64px, always dark) ───────────────────────────────────────────
function IconStrip({ active, onSelect }: { active: string; onSelect: (to: string) => void }) {
  const { dark, toggle } = useThemeStore()
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center py-3 w-16 bg-sb-bg border-r border-sb-border h-full shrink-0">
      {/* Logo mark */}
      <div className="mb-3">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>

      {/* Nav icons */}
      <div className="flex-1 flex flex-col items-center gap-1 w-full px-2">
        {NAV.map((item) => (
          <button
            key={item.to}
            onClick={() => onSelect(item.to)}
            title={item.label}
            className={`sb-btn w-full ${active === item.to ? 'active' : ''}`}
          >
            <Icon d={PATHS[item.icon as keyof typeof PATHS]} size={18} />
          </button>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1 px-2 pb-1">
        <button onClick={toggle} title={dark ? 'Светлая тема' : 'Тёмная тема'} className="sb-btn w-full">
          <Icon d={dark ? PATHS.sun : PATHS.moon} size={18} />
        </button>
        <button onClick={() => { logout(); navigate('/login') }} title="Выйти" className="sb-btn w-full">
          <Icon d={PATHS.logout} size={18} />
        </button>
      </div>
    </div>
  )
}

// ── Text nav panel (220px, collapsible) ──────────────────────────────────────
function NavPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore()
  const location = useLocation()
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications()

  const items = NAV.filter((i) => user && i.roles.includes(user.role))

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 bg-black/40 z-10 lg:hidden" onClick={onClose} />}

      <div
        className="h-full bg-sb-panel border-r border-sb-border flex flex-col shrink-0 z-10 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: open ? 220 : 0 }}
      >
        <div className="px-4 pt-5 pb-3 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-sb-text whitespace-nowrap">
            Навигация
          </p>
        </div>

        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {items.map((item) => {
            const isActive = location.pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={() => `nav-item whitespace-nowrap ${isActive ? 'active' : ''}`}
              >
                <Icon d={PATHS[item.icon as keyof typeof PATHS]} size={15} />
                <span>{item.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
              </NavLink>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sb-border shrink-0">
          {isSupported && (
            <button
              onClick={isSubscribed ? unsubscribe : subscribe}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs w-full transition hover:bg-white/6 whitespace-nowrap ${isSubscribed ? 'text-accent' : 'text-sb-text'}`}
            >
              <Icon d={PATHS.bell} size={14} />
              {isSubscribed ? 'Уведомления вкл' : 'Уведомления выкл'}
            </button>
          )}
          <div className="px-3 mt-2">
            <p className="text-sm font-medium text-white truncate">{user?.login}</p>
            <p className="text-xs text-sb-text mt-0.5">{user?.role}</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default function Layout() {
  const location = useLocation()
  const { dark, toggle } = useThemeStore()
  const [navOpen, setNavOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Auto-close panel on mobile after navigation
  useEffect(() => { if (isMobile) setNavOpen(false) }, [location.pathname, isMobile])

  const activeSection = NAV.find((i) => location.pathname.startsWith(i.to))?.to ?? ''
  const currentLabel  = NAV.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Главная'

  const handleIconClick = (to: string) => {
    setNavOpen((prev) => !(prev && activeSection === to))
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      {/* ── Desktop sidebar ── */}
      <div className="hidden lg:flex h-full">
        <IconStrip active={activeSection} onSelect={handleIconClick} />
        <NavPanel open={navOpen} onClose={() => setNavOpen(false)} />
      </div>

      {/* ── Mobile sidebar (overlay) ── */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-30 flex">
          <IconStrip active={activeSection} onSelect={handleIconClick} />
          <NavPanel open={true} onClose={() => setNavOpen(false)} />
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center gap-3 h-14 px-4 shrink-0 bg-surface border-b border-[var(--border)]">
          <button
            className="lg:hidden p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-raised transition"
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon d={navOpen ? PATHS.close : PATHS.menu} size={20} />
          </button>

          <span className="text-sm text-muted">SEODirect</span>
          <span className="text-muted">·</span>
          <span className="text-sm font-semibold text-primary">{currentLabel}</span>

          {/* Mobile theme toggle */}
          <div className="ml-auto lg:hidden">
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-raised transition"
            >
              <Icon d={dark ? PATHS.sun : PATHS.moon} size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
