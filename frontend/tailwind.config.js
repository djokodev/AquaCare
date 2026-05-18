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
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
