import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { login, getMe } from '../api/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const { dark, toggle } = useThemeStore()
  const [form, setForm] = useState({ login: '', password: '', remember_me: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const tokens = await login(form.login, form.password, form.remember_me)
      setTokens(tokens.access_token, tokens.refresh_token)
      const me = await getMe()
      setUser(me)
      navigate('/projects')
    } catch (err: any) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      setError(status === 429 ? (detail || 'Слишком много попыток. Попробуйте позже.') : 'Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-page">
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="fixed top-5 right-5 p-2.5 rounded-xl bg-surface border border-[var(--border)] text-muted hover:text-primary transition"
        title={dark ? 'Светлая тема' : 'Тёмная тема'}
      >
        {dark
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        }
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold leading-none text-primary">SEODirect</p>
            <p className="text-xs mt-0.5 text-muted">Маркетинговая платформа</p>
          </div>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-xl font-bold mb-1 text-primary">Вход в систему</h2>
          <p className="text-sm mb-6 text-muted">Введите ваши учётные данные</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted">Логин</label>
              <input
                type="text"
                className="field"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                required
                autoFocus
                autoComplete="username"
                placeholder="your_login"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted">Пароль</label>
              <input
                type="password"
                className="field"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="remember"
                checked={form.remember_me}
                onChange={(e) => setForm({ ...form, remember_me: e.target.checked })}
                className="w-4 h-4 rounded accent-accent"
              />
              <label htmlFor="remember" className="text-sm text-muted cursor-pointer select-none">
                Запомнить меня на 90 дней
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-accent w-full py-3 text-sm font-semibold mt-2">
              {loading
                ? <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Выполняю вход...
                  </span>
                : 'Войти'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6 text-muted">
          SEODirect v0.2 · Внутренний инструмент агентства
        </p>
      </div>
    </div>
  )
}
