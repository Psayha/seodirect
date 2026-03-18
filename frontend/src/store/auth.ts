import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: { id: string; login: string; email: string; role: string } | null
  setTokens: (access: string, refresh?: string) => void
  setUser: (user: AuthState['user']) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) =>
        set({ accessToken: access, ...(refresh !== undefined ? { refreshToken: refresh } : {}) }),
      setUser: (user) => set({ user }),
      logout: () => {
        const rt = get().refreshToken
        if (rt) {
          axios.post('/api/auth/logout', { refresh_token: rt }).catch(() => {})
        }
        set({ accessToken: null, refreshToken: null, user: null })
        // Clear React Query cache to prevent stale data leak between sessions
        import('../main').then((m) => m.queryClient.clear()).catch(() => {})
      },
    }),
    { name: 'auth-storage' }
  )
)
