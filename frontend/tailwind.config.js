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
        'aquacare-primary': '#059669',
        'aquacare-primary-light': '#10b981',
        'aquacare-primary-dark': '#047857',
        cream: '#f8fafc',
        'gray-light': '#64748b',
        'gray-dark': '#1e293b',
        error: '#dc2626',
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
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
