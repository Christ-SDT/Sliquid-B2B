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
          // WCAG 1.4.3/1.4.11 remediation (accessibility audit, Sept 2026):
          // the original #0A84C0 measured 4.14:1 for normal text and
          // white-button text on white — below the 4.5:1 required. `blue` and
          // `dark-blue` (its hover state) were both darkened; `blue-brand` keeps
          // the original brand hue for large (>=18pt/14pt-bold) decorative use
          // only, where 3:1 still applies and 4.14:1 already clears that.
          blue: '#0870a3',
          'dark-blue': '#075d85',
          'blue-brand': '#0A84C0',
          // Lighter blue for the same "highlighted" role on dark surfaces
          // (utility bar) — `blue` reversed direction fails there (3.55:1 on
          // #1f2937); this reaches 6.28:1.
          'blue-on-dark': '#4db4e6',
          teal: '#5c7676',
        },
        'text-dark': '#111111',
        'text-gray': '#4b5563',
        'text-light-gray': '#9ca3af',
        'bg-off-white': '#f9fafb',
        'bg-light-blue': '#e8f4fb',
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
