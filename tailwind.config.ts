import type { Config } from 'tailwindcss';

/**
 * Lao text needs a taller line-height than Latin defaults: the vowel and tone
 * marks stack above and below the baseline and clip at Tailwind's stock
 * leading. Every size below is paired with a line-height that clears them.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-lao)', 'Noto Sans Lao', 'Phetsarath OT', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.6' }],
        sm: ['0.875rem', { lineHeight: '1.7' }],
        base: ['1rem', { lineHeight: '1.8' }],
        lg: ['1.125rem', { lineHeight: '1.8' }],
        xl: ['1.25rem', { lineHeight: '1.7' }],
        '2xl': ['1.5rem', { lineHeight: '1.6' }],
        '3xl': ['1.875rem', { lineHeight: '1.5' }],
      },
      colors: {
        /** The shop's brand red — the gradient stops and the shades around them. */
        brand: {
          50: '#fdf2f2',
          100: '#fbe0e0',
          200: '#f5b8b8',
          300: '#e98383',
          400: '#d64646',
          500: '#b81c1c',
          600: '#960000', // gradient stop 0%
          700: '#7a0000',
          800: '#5e0000', // gradient stop 55%
          900: '#3a0000', // gradient stop 100%
          950: '#240000',
        },
        /** Gold reads as the accent against the red — the shop's own pairing. */
        gold: {
          50: '#fdf9ed',
          100: '#f8eecb',
          200: '#f0dc94',
          300: '#e7c455',
          400: '#e0ae2c',
          500: '#d0951d',
          600: '#b47416',
          700: '#8f5415',
          800: '#764318',
          900: '#653919',
        },
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(175deg, #960000 0%, #5E0000 55%, #3a0000 100%)',
      },
      boxShadow: {
        canvas: '0 1px 3px rgb(0 0 0 / 0.08), 0 12px 32px -12px rgb(0 0 0 / 0.28)',
        rail: 'inset -1px 0 0 rgb(255 255 255 / 0.08)',
      },
      keyframes: {
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
        'toast-in': {
          from: { transform: 'translateX(110%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'toast-out': {
          from: { transform: 'translateX(0)', opacity: '1' },
          to: { transform: 'translateX(110%)', opacity: '0' },
        },
        'toast-swipe-out': {
          from: { transform: 'translateX(var(--radix-toast-swipe-end-x))' },
          to: { transform: 'translateX(110%)' },
        },
      },
      animation: {
        'collapsible-down': 'collapsible-down 180ms ease-out',
        'collapsible-up': 'collapsible-up 160ms ease-in',
        'toast-in': 'toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-out': 'toast-out 160ms ease-in',
        'toast-swipe-out': 'toast-swipe-out 140ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
