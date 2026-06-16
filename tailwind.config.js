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
    },
  },
  plugins: [],
}
