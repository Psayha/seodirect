import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { usePushNotifications } from '../hooks/usePushNotifications'

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    >
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
  { to: '/settings',    icon: 'settings', label: 'Настройки',    roles: ['super_admin','admin','specialist'] },
  { to: '/admin/users', icon: 'users',    label: 'Пользователи', roles: ['super_admin','admin'] },
  { to: '/trash',       icon: 'trash',    label: 'Корзина',      roles: ['super_admin','admin'] },
]

/* ── Tooltip ──────────────────────────────────────────────────────────────── */
function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group w-full">
      {children}
      <span
        className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2
                   px-3 py-1.5 rounded-xl text-xs font-semibold text-white whitespace-nowrap z-50
                   opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
                   transition-all duration-150 ease-out"
        style={{
          background: 'var(--sb-panel)',
          border: '1px solid var(--sb-border)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        }}
      >
        {label}
        <span
          className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
          style={{ borderRightColor: 'var(--sb-panel)' }}
        />
      </span>
    </div>
  )
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
function Sidebar() {
  const { user, logout } = useAuthStore()
  const { dark, toggle } = useThemeStore()
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const [logoutHover, setLogoutHover] = useState(false)

  const visible = NAV.filter((i) => user && i.roles.includes(user.role))

  return (
    <div
      className="flex flex-col items-center py-3 w-16 h-full shrink-0"
      style={{ background: 'var(--sb-bg)', borderRight: '1px solid var(--sb-border)' }}
    >
      {/* Logo mark */}
      <div className="mb-4 shrink-0">
        <button
          onClick={() => navigate('/projects')}
          className="w-9 h-9 rounded-xl flex items-center justify-center
                     transition-all duration-200 hover:scale-105 hover:brightness-110"
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
            boxShadow: '0 2px 14px var(--sb-glow)',
          }}
          aria-label="Проекты"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5" />
          </svg>
        </button>
      </div>

      {/* Thin divider */}
      <div className="w-6 h-px mb-2 shrink-0" style={{ background: 'var(--sb-border)' }} />

      {/* Nav items */}
      <div className="flex-1 flex flex-col items-center gap-0.5 w-full px-2.5">
        {visible.map((item) => {
          const isActive = location.pathname.startsWith(item.to)
          return (
            <NavTooltip key={item.to} label={item.label}>
              <button
                onClick={() => navigate(item.to)}
                className={`sb-btn w-full ${isActive ? 'active' : ''}`}
                aria-label={item.label}
              >
                <Icon d={PATHS[item.icon as keyof typeof PATHS]} size={18} />
                {/* Active indicator dot */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--sb-glow)' }}
                  />
                )}
              </button>
            </NavTooltip>
          )
        })}
      </div>

      {/* Bottom controls */}
      <div className="flex flex-col items-center gap-0.5 px-2.5 pb-1 shrink-0">
        <div className="w-6 h-px mb-1" style={{ background: 'var(--sb-border)' }} />

        {isSupported && (
          <NavTooltip label={isSubscribed ? 'Уведомления вкл.' : 'Уведомления выкл.'}>
            <button
              onClick={isSubscribed ? unsubscribe : subscribe}
              className="sb-btn w-full"
              style={{ color: isSubscribed ? 'var(--accent)' : undefined }}
              aria-label="Уведомления"
            >
              <Icon d={PATHS.bell} size={18} />
            </button>
          </NavTooltip>
        )}

        <NavTooltip label={dark ? 'Светлая тема' : 'Тёмная тема'}>
          <button onClick={toggle} className="sb-btn w-full" aria-label="Переключить тему">
            <Icon d={dark ? PATHS.sun : PATHS.moon} size={18} />
          </button>
        </NavTooltip>

        <NavTooltip label="Выйти">
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="sb-btn w-full"
            style={{ color: logoutHover ? '#f87171' : undefined, transition: 'color 0.15s' }}
            onMouseEnter={() => setLogoutHover(true)}
            onMouseLeave={() => setLogoutHover(false)}
            aria-label="Выйти"
          >
            <Icon d={PATHS.logout} size={18} />
          </button>
        </NavTooltip>
      </div>
    </div>
  )
}

/* ── Root layout ──────────────────────────────────────────────────────────── */
export default function Layout() {
  const location = useLocation()
  const { dark, toggle } = useThemeStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const currentLabel = NAV.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Главная'

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 flex animate-fade-in">
          <Sidebar />
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header
          className="flex items-center gap-3 h-13 px-4 shrink-0 lg:hidden"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            className="p-2 rounded-xl"
            style={{ color: 'var(--muted)' }}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Icon d={mobileOpen ? PATHS.close : PATHS.menu} size={20} />
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>SEODirect</span>
          <span style={{ color: 'var(--subtle)' }}>·</span>
          <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{currentLabel}</span>
          <div className="ml-auto">
            <button
              onClick={toggle}
              className="p-2 rounded-xl"
              style={{ color: 'var(--muted)' }}
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
