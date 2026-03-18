import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  user: { id: string; login: string; email: string; role: string } | null
  setTokens: (access: string) => void
  setUser: (user: AuthState['user']) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setTokens: (access) => set({ accessToken: access }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ accessToken: null, user: null })
        // Clear React Query cache to prevent stale data leak between sessions
        import('../main').then((m) => m.queryClient.clear()).catch(() => {})
      },
    }),
    { name: 'auth-storage' }
  )
)
