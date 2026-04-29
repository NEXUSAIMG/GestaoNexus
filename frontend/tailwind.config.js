/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta base da Nexus — pode ajustar depois para combinar com a identidade visual.
        nexus: {
          50:  '#f0f7ff',
          100: '#e0efff',
          200: '#bae0ff',
          300: '#7cc5ff',
          400: '#36a6ff',
          500: '#0b87f0',
          600: '#006cce',
          700: '#0056a6',
          800: '#074a89',
          900: '#0c3f72',
          950: '#08284c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
