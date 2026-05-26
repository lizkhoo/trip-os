/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Warm editorial palette inspired by japan-2026
        ink: {
          DEFAULT: '#1f1a17',
          soft: '#2c2520',
          muted: '#6b6058',
        },
        paper: {
          DEFAULT: '#fbf7f0',
          warm: '#f3ead9',
          dim: '#e8dfcc',
        },
        accent: {
          rust: '#b04a2a',
          forest: '#3f6b4e',
          ochre: '#c98a3a',
          plum: '#7a3b56',
          slate: '#4a5d6e',
        },
        // Reservation type tokens — used by ReservationBadge
        type: {
          flight: '#4a5d6e', // slate — sky/transit-coded
          lodging: '#b04a2a', // rust — hearth
          dining: '#c98a3a', // ochre — warmth
          activity: '#3f6b4e', // forest — exploration
          transit: '#7a3b56', // plum — movement
        },
      },
      fontFamily: {
        sans: ['System'],
        serif: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
