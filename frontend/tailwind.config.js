/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // All colors reference CSS variables — one class works in both themes.
      // Usage: bg-surface, text-muted, border-base, etc.
      colors: {
        page:    'var(--page)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised:  'var(--surface-raised)',
        },
        muted:   'var(--muted)',
        base:    'var(--base)',        // alias for border
        primary: 'var(--text)',
        accent: {
          DEFAULT: '#34c759',
          hover:   '#2aab4a',
          subtle:  '#34c75918',
        },
        sb: {
          bg:     'var(--sb-bg)',
          panel:  'var(--sb-panel)',
          text:   'var(--sb-text)',
          active: 'var(--sb-active)',
          border: 'var(--sb-border)',
        },
        // Status colours (theme-agnostic)
        'status-active':    '#34c759',
        'status-paused':    '#fbbf24',
        'status-completed': '#60a5fa',
        'status-archived':  '#9ca3af',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      textColor: {
        DEFAULT: 'var(--text)',
        muted:   'var(--muted)',
      },
      backgroundColor: {
        DEFAULT: 'var(--surface)',
      },
      opacity: {
        '6': '0.06',
        '8': '0.08',
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
