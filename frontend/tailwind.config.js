/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  safelist: [
    // Couleurs custom MAVECAM - empêche tree-shaking des classes dynamiques
    'bg-mavecam-primary',
    'bg-mavecam-primary-light',
    'bg-mavecam-primary-dark',
    'border-mavecam-primary',
    'border-mavecam-primary-light',
    'border-mavecam-primary-dark',
    'text-mavecam-primary',
    'text-white',
    'text-gray-dark',
    'text-gray-light',
  ],
  theme: {
    extend: {
      colors: {
        'mavecam-primary': '#059669',
        'mavecam-primary-light': '#10b981',
        'mavecam-primary-dark': '#047857',
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
