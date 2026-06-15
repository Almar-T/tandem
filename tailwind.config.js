/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Productivity states used across timer + analytics.
        productive: '#16a34a', // green  — active work
        explained: '#eab308', // yellow — explained idle
        unexplained: '#dc2626', // red   — unexplained idle
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
