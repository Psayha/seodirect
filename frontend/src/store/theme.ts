import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeStore {
  mode: ThemeMode
  dark: boolean          // resolved: is it actually dark right now?
  setMode: (m: ThemeMode) => void
  cycle: () => void      // light → dark → system → light
}

const sysDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function resolve(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return sysDark()
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'system' as ThemeMode,
      dark: sysDark(),

      setMode: (m) => {
        const dark = resolve(m)
        applyTheme(dark)
        set({ mode: m, dark })
      },

      cycle: () => {
        const order: ThemeMode[] = ['light', 'dark', 'system']
        const idx = order.indexOf(get().mode)
        const next = order[(idx + 1) % order.length]
        get().setMode(next)
      },
    }),
    {
      name: 'seodirect-theme',
      partialize: (s) => ({ mode: s.mode }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const dark = resolve(state.mode)
        applyTheme(dark)
        state.dark = dark

        // Follow system changes when mode === 'system'
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (useThemeStore.getState().mode === 'system') {
            useThemeStore.setState({ dark: e.matches })
            applyTheme(e.matches)
          }
        })
      },
    }
  )
)
