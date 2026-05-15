/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        bangla: ['Hind Siliguri', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#1a6fb5',
          light: '#2d8de0',
          dark: '#124d80',
        },
        income: '#16a34a',
        expense: '#dc2626',
        notice: {
          warning: '#f59e0b',
          success: '#10b981',
          info: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
}
