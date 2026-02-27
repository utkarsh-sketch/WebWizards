/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#f8fafc',
        panel: '#ffffff',
        accent: '#16a34a',
        danger: '#dc2626',
        warn: '#f59e0b',
      },
      boxShadow: {
        glow: '0 1px 2px rgba(15,23,42,0.06), 0 12px 28px -20px rgba(30,64,175,0.28)',
      },
      keyframes: {
        pulseSlow: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.25' },
          '50%': { transform: 'scale(1.08)', opacity: '0.45' },
        },
      },
      animation: {
        pulseSlow: 'pulseSlow 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
