const tokens = require('./src/theme/tokens.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  safelist: [
    // Couleurs custom AquaCare - empêche tree-shaking des classes dynamiques
    'bg-aquacare-primary',
    'bg-aquacare-primary-light',
    'bg-aquacare-primary-dark',
    'border-aquacare-primary',
    'border-aquacare-primary-light',
    'border-aquacare-primary-dark',
    'text-aquacare-primary',
    'text-white',
    'text-gray-dark',
    'text-gray-light',
  ],
  theme: {
    extend: {
      colors: {
        'aquacare-primary': tokens.colors.brand.primary,
        'aquacare-primary-light': tokens.colors.brand.light,
        'aquacare-primary-dark': tokens.colors.brand.dark,
        cream: tokens.colors.surface.page,
        'gray-light': tokens.colors.text.muted,
        'gray-dark': tokens.colors.text.primary,
        error: tokens.colors.status.error,
        success: tokens.colors.status.success,
        warning: tokens.colors.status.warning,
        info: tokens.colors.status.info,
        'aquacare-selected': tokens.colors.surface.selected,
        'border-default': tokens.colors.border.default,
        'border-subtle': tokens.colors.border.subtle,
        'text-muted': tokens.colors.text.muted,
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      fontWeight: {
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      borderRadius: {
        sm: `${tokens.radii.sm}px`,
        md: `${tokens.radii.md}px`,
        lg: `${tokens.radii.lg}px`,
        xl: `${tokens.radii.xl}px`,
        '2xl': `${tokens.radii.xxl}px`,
        full: tokens.radii.full,
      },
      spacing: Object.fromEntries(
        Object.entries(tokens.spacing).map(([key, value]) => [key, `${value}px`]),
      ),
      opacity: tokens.opacity,
    },
  },
  plugins: [],
};
