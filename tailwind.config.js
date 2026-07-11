/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // APIIT brand: teal #19B9AF (RGB 25,185,175) with white and light grey
        brand: {
          teal: '#19B9AF',
          tealDark: '#12968E',
          tealDeep: '#0B6E68',
          tealLight: '#E6F8F6',
          ink: '#0C1D1B', // near-black with a teal undertone (sidebar / hero)
          inkSoft: '#12302D',
          grey: '#F5F7F7',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(12,29,27,0.04), 0 4px 16px rgba(12,29,27,0.05)',
        lift: '0 4px 8px rgba(12,29,27,0.06), 0 12px 32px rgba(12,29,27,0.10)',
        glow: '0 4px 20px rgba(25,185,175,0.35)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.45s ease-out both',
        pulseSoft: 'pulseSoft 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
