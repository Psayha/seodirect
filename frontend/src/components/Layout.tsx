import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { usePushNotifications } from '../hooks/usePushNotifications'

// ── Icons (inline SVG, no dep) ────────────────────────────────────────────────
const Icon = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const Icons = {
  projects:  'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 3v4 M16 3v4',
  settings:  'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  users:     'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  trash:     'M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2',
  sun:       'M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 5a7 7 0 100 14A7 7 0 0012 5z',
  moon:      'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  bell:      'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
  logout:    'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
  menu:      'M3 12h18 M3 6h18 M3 18h18',
  close:     'M18 6L6 18 M6 6l12 12',
  logo:      'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
}

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/projects', icon: 'projects', label: 'Проекты', roles: ['super_admin','admin','specialist','viewer'] },
  { to: '/settings', icon: 'settings', label: 'Настройки', roles: ['super_admin','admin','specialist'] },
  { to: '/admin/users', icon: 'users', label: 'Пользователи', roles: ['super_admin','admin'] },
  { to: '/trash', icon: 'trash', label: 'Корзина', roles: ['super_admin','admin'] },
]

// ── Sidebar icon strip ─────────────────────────────────────────────────────────
function IconStrip({ activeSection, onSelect, onLogoClick }: {
  activeSection: string
  onSelect: (to: string) => void
  onLogoClick: () => void
}) {
  const { dark, toggle } = useThemeStore()
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div
      style={{ background: 'var(--bg-sb-icon)', width: 64, borderRight: '1px solid var(--border-dark)' }}
      className="h-full flex flex-col items-center py-3 shrink-0 z-20"
    >
      {/* Logo */}
      <button
        onClick={onLogoClick}
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 hover:bg-white/10 transition"
        title="SEODirect"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d={Icons.logo} stroke="#34c759" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="flex-1 flex flex-col items-center gap-1 w-full px-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.to}
            onClick={() => onSelect(item.to)}
            title={item.label}
            className={`sb-icon-btn w-full ${activeSection === item.to ? 'active' : ''}`}
          >
            <Icon d={Icons[item.icon as keyof typeof Icons]} size={18} />
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 px-2 pb-1">
        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          title={dark ? 'Светлая тема' : 'Тёмная тема'}
          className="sb-icon-btn w-full"
        >
          <Icon d={dark ? Icons.sun : Icons.moon} size={18} />
        </button>
        {/* Logout */}
        <button
          onClick={() => { logout(); navigate('/login') }}
          title="Выйти"
          className="sb-icon-btn w-full"
        >
          <Icon d={Icons.logout} size={18} />
        </button>
      </div>
    </div>
  )
}

// ── Nav text panel ─────────────────────────────────────────────────────────────
function NavPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuthStore()
  const location = useLocation()
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications()

  const visibleItems = NAV_ITEMS.filter((i) => user && i.roles.includes(user.role))

  return (
    <>
      {/* Mobile backdrop */}
      {visible && (
        <div
          className="fixed inset-0 bg-black/40 z-10 lg:hidden"
          onClick={onClose}
        />
      )}
      <div
        style={{
          background: 'var(--bg-sb-nav)',
          borderRight: '1px solid var(--border-dark)',
          width: visible ? 220 : 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}
        className="h-full flex flex-col shrink-0 z-10"
      >
        <div className="px-4 pt-5 pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-sb-text">Меню</p>
        </div>

        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={() => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon d={Icons[item.icon as keyof typeof Icons]} size={16} />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom: user info + notifications */}
        <div className="px-3 py-4 border-t space-y-2" style={{ borderColor: 'var(--border-dark)' }}>
          {isSupported && (
            <button
              onClick={isSubscribed ? unsubscribe : subscribe}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition ${
                isSubscribed ? 'text-accent' : 'text-sb-text'
              } hover:bg-white/6`}
            >
              <Icon d={Icons.bell} size={14} />
              {isSubscribed ? 'Уведомления вкл' : 'Уведомления'}
            </button>
          )}
          <div className="px-3">
            <p className="text-sm font-medium text-white truncate">{user?.login}</p>
            <p className="text-xs text-sb-text mt-0.5">{user?.role}</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main layout ────────────────────────────────────────────────────────────────
export default function Layout() {
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(true)

  // Auto-close on mobile when navigating
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  useEffect(() => { if (isMobile) setNavOpen(false) }, [location.pathname, isMobile])

  // Active section for icon strip highlight
  const activeSection = NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))?.to ?? ''

  const handleIconSelect = (to: string) => {
    if (activeSection === to && navOpen) {
      setNavOpen(false)
    } else {
      setNavOpen(true)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      {/* Desktop: icon strip */}
      <div className="hidden lg:flex flex-col h-full">
        <IconStrip
          activeSection={activeSection}
          onSelect={handleIconSelect}
          onLogoClick={() => setNavOpen((v) => !v)}
        />
      </div>

      {/* Nav text panel */}
      <div className="hidden lg:flex flex-col h-full">
        <NavPanel visible={navOpen} onClose={() => setNavOpen(false)} />
      </div>

      {/* Mobile: fixed sidebar overlay */}
      <div className="lg:hidden">
        {navOpen && (
          <div className="fixed inset-0 z-30 flex">
            <div style={{ background: 'var(--bg-sb-icon)', width: 64 }} className="flex flex-col items-center py-3 shrink-0">
              <IconStrip
                activeSection={activeSection}
                onSelect={handleIconSelect}
                onLogoClick={() => setNavOpen(false)}
              />
            </div>
            <NavPanel visible={true} onClose={() => setNavOpen(false)} />
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header
          className="flex items-center gap-3 px-4 h-14 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}
        >
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-sb-text transition"
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon d={navOpen ? Icons.close : Icons.menu} size={20} />
          </button>

          {/* Breadcrumb / title */}
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            SEODirect
          </span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Главная'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Mobile dark mode */}
            <button
              onClick={useThemeStore.getState().toggle}
              className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-sb-text transition"
            >
              <Icon d={useThemeStore.getState().dark ? Icons.sun : Icons.moon} size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
