/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#121317',
          900: '#17191F',
          800: '#1D2027',
          700: '#242833',
          600: '#2C313D',
        },
        line: '#333947',
        ice: '#E8EBEF',
        hi: {
          300: '#FFE066',
          400: '#FFD60A',
          500: '#F2C300',
        },
        signal: {
          400: '#FF6B3D',
          500: '#E04820',
          600: '#C73D18',
        },
        steel: {
          300: '#A9B2BF',
          400: '#8A94A3',
          500: '#7C8794',
          600: '#4A5360',
        },
        work: {
          400: '#5B8DEF',
          500: '#4A7DE8',
        },
        go: {
          400: '#3FBF7F',
          500: '#2EAF72',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'stripe-slide': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '24px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
        'stripe-slide': 'stripe-slide 1s linear infinite',
      },
    },
  },
  plugins: [],
};