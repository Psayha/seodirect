/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page:    'var(--page)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised:  'var(--surface-raised)',
        },
        muted:   'var(--muted)',
        primary: 'var(--text)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          subtle:  'var(--accent-subtle)',
          text:    'var(--accent-text)',
        },
        sb: {
          bg:     'var(--sb-bg)',
          panel:  'var(--sb-panel)',
          text:   'var(--sb-text)',
          active: 'var(--sb-active)',
          border: 'var(--sb-border)',
        },
        // Status colours
        'status-active':    '#10b981',
        'status-paused':    '#f59e0b',
        'status-completed': '#3b82f6',
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
      boxShadow: {
        'card':    '0 1px 4px 0 rgba(10,18,40,0.06), 0 0 0 1px rgba(10,18,40,0.04)',
        'card-md': '0 4px 16px 0 rgba(10,18,40,0.10)',
        'card-lg': '0 8px 32px 0 rgba(10,18,40,0.12)',
      },
      opacity: {
        '6': '0.06',
        '8': '0.08',
      },
      borderRadius: {
        'xl':  '10px',
        '2xl': '14px',
        '3xl': '20px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
