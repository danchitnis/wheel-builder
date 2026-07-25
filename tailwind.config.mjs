/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        titanium: {
          50: '#f6f6f7',
          100: '#e1e1e3',
          200: '#bebfc4',
          300: '#919299',
          400: '#696a70',
          500: '#4d4e53',
          600: '#3c3c40',
          700: '#2a2a2c',
          800: '#1c1c1e',
          900: '#141416',
          950: '#0a0a0b',
        },
      },
    },
  },
  plugins: [],
}
