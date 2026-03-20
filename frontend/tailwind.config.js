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
          overlay: 'var(--surface-overlay)',
        },
        muted:   'var(--muted)',
        subtle:  'var(--subtle)',
        primary: 'var(--text)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          subtle:  'var(--accent-subtle)',
          text:    'var(--accent-text)',
          glow:    'var(--accent-glow)',
        },
        sb: {
          bg:     'var(--sb-bg)',
          panel:  'var(--sb-panel)',
          text:   'var(--sb-text)',
          active: 'var(--sb-active)',
          border: 'var(--sb-border)',
        },
        'status-active':    '#10b981',
        'status-paused':    '#f59e0b',
        'status-completed': '#60a5fa',
        'status-archived':  '#6b7280',
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
      /* Dark-optimised shadows — rgba(0,0,0) not rgba(10,18,40) */
      boxShadow: {
        'card':    'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 16px rgba(0,0,0,0.18)',
        'card-md': 'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 32px rgba(0,0,0,0.26)',
        'card-lg': 'inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 48px rgba(0,0,0,0.34)',
        'glow':    '0 0 24px var(--accent-glow)',
      },
      /* Bento-friendly radii: 12 / 18 / 24 / 32 */
      borderRadius: {
        'xl':  '12px',
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '32px',
      },
      /* DM Sans display + DM Mono for data/code */
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      opacity: {
        '6': '0.06',
        '8': '0.08',
      },
      /* Spring easing for hover/press states */
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34,1.3,0.64,1)',
        'spring-soft': 'cubic-bezier(0.34,1.15,0.64,1)',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95) translateY(5px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-up':  'fade-up 0.32s cubic-bezier(0.34,1.2,0.64,1) both',
        'fade-in':  'fade-in 0.20s ease both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.34,1.2,0.64,1) both',
      },
    },
  },
  plugins: [],
}
