import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sliquid: {
          blue: '#00AEEF',
          'dark-blue': '#008cb9',
        },
        'text-dark': '#111111',
        'text-gray': '#4b5563',
        'text-light-gray': '#9ca3af',
        'bg-off-white': '#f9fafb',
        'bg-light-blue': '#f0f9ff',
        footer: '#1f2937',
      },
      borderRadius: {
        card: '16px',
        img: '12px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      height: {
        hero: '650px',
      },
    },
  },
  plugins: [],
}

export default config
