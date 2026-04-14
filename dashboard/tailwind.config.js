/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0D0D0D',
        'solana-green': '#14F195',
        'emergency-red': '#FF4B4B',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Geist Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'brutal-green': '4px 4px 0px 0px #14F195',
        'brutal-red': '4px 4px 0px 0px #FF4B4B',
        'glow-green': '0 0 15px rgba(20, 241, 149, 0.3)',
        'glow-red': '0 0 15px rgba(255, 75, 75, 0.3)',
      }
    },
  },
  plugins: [],
}
