/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // The real SF stack first, with a graceful fallback chain off-Apple.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI Variable Display"',
          '"Segoe UI"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        accent: {
          DEFAULT: '#fa243c',
          soft: '#ff6482',
          deep: '#c9102a',
        },
        ink: {
          900: '#08080a',
          800: '#0e0e11',
          700: '#16161a',
        },
      },
      borderRadius: {
        card: '18px',
        panel: '26px',
        pill: '999px',
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.07) inset, 0 20px 60px -20px rgba(0,0,0,0.7)',
        lift: '0 30px 80px -30px rgba(0,0,0,0.85)',
        art: '0 40px 90px -30px rgba(0,0,0,0.9)',
      },
      transitionTimingFunction: {
        // Apple's standard ease and a gentle overshoot for entrances.
        apple: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(4%,-6%,0) scale(1.12)' },
          '66%': { transform: 'translate3d(-5%,4%,0) scale(1.05)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.32,0.72,0,1) both',
        shimmer: 'shimmer 1.8s infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        drift: 'drift 24s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
