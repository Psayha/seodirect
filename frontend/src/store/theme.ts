import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeStore {
  dark: boolean
  toggle: () => void
  setDark: (v: boolean) => void
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      dark: true,
      toggle: () => set((s) => {
        const next = !s.dark
        applyTheme(next)
        return { dark: next }
      }),
      setDark: (v) => set(() => {
        applyTheme(v)
        return { dark: v }
      }),
    }),
    { name: 'seodirect-theme', onRehydrateStorage: () => (state) => { if (state) applyTheme(state.dark) } }
  )
)
