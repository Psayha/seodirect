import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { usePushNotifications } from '../hooks/usePushNotifications'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-gray-700">
          <h1 className="text-lg font-bold">SEODirect</h1>
          <p className="text-xs text-gray-400 mt-0.5">v0.2</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`
            }
          >
            📁 Проекты
          </NavLink>
          {user?.role !== 'viewer' && (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`
              }
            >
              ⚙️ Настройки
            </NavLink>
          )}
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`
              }
            >
              👥 Пользователи
            </NavLink>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-gray-700 space-y-2">
          {isSupported && (
            <button
              onClick={isSubscribed ? unsubscribe : subscribe}
              title={isSubscribed ? 'Отключить уведомления' : 'Включить уведомления'}
              className={`w-full text-xs px-2 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                isSubscribed
                  ? 'bg-green-800 text-green-200 hover:bg-green-700'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {isSubscribed ? '🔔 Уведомления вкл' : '🔕 Уведомления'}
            </button>
          )}
          <p className="text-sm text-gray-300 truncate">{user?.login}</p>
          <p className="text-xs text-gray-500">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-white transition"
          >
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
