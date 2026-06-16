/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hearth: {
          green:  '#1b2a1e',
          cream:  '#f9f7f2',
          gold:   '#c2a76d',
          muted:  '#e8e4da',
          border: '#d4cfc4',
          text:   '#3d4f3f',
        },
        // Keep for any timer / analytics legacy usage
        productive:   '#16a34a',
        explained:    '#eab308',
        unexplained:  '#dc2626',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      animation: {
        glow: 'glow 2.5s ease-in-out infinite',
        'fade-up': 'fadeUp 0.25s ease-out',
      },
      keyframes: {
        glow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(194,167,109,0.25), 0 4px 16px rgba(27,42,30,0.06)' },
          '50%':       { boxShadow: '0 0 22px rgba(194,167,109,0.55), 0 4px 24px rgba(194,167,109,0.18)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
