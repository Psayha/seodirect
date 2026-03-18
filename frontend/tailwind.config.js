/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Accent green — same as рег.облако
        accent: {
          DEFAULT: '#34c759',
          hover:   '#2aab4a',
          muted:   '#34c75920',
        },
        // Sidebar
        sb: {
          icon:   '#0d0e11',   // narrow icon strip bg
          nav:    '#14151a',   // text nav panel bg
          active: '#1e1f26',   // active item bg
          border: '#ffffff12',
          text:   '#8b8d98',
          hover:  '#1a1b22',
        },
        // Surface (cards, modals)
        surface: {
          DEFAULT: '#1c1d24',
          2:       '#22232b',
          border:  '#2e2f3a',
        },
        // Page background
        page: '#111216',
        // Keep primary alias pointing to accent for backward compat
        primary: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          300: '#86efac',
          500: '#34c759',
          600: '#2aab4a',
          700: '#22923b',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
