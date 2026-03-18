import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeStore {
  dark: boolean
  // null = follow system, true/false = explicit user choice
  userChoice: boolean | null
  toggle: () => void
  setDark: (v: boolean) => void
}

const sysDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      dark: sysDark(),
      userChoice: null,

      toggle: () => set(() => {
        const next = !get().dark
        applyTheme(next)
        return { dark: next, userChoice: next }
      }),

      setDark: (v) => set(() => {
        applyTheme(v)
        return { dark: v, userChoice: v }
      }),
    }),
    {
      name: 'seodirect-theme',
      partialize: (s) => ({ userChoice: s.userChoice }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Apply user's explicit choice, or fall back to system
        const dark = state.userChoice ?? sysDark()
        applyTheme(dark)
        state.dark = dark

        // Follow system changes only when user hasn't chosen explicitly
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (useThemeStore.getState().userChoice === null) {
            useThemeStore.setState({ dark: e.matches })
            applyTheme(e.matches)
          }
        })
      },
    }
  )
)
