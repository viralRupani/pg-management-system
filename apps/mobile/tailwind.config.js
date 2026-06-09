/** @type {import('tailwindcss').Config} */
// NativeWind v4 is built on Tailwind CSS v3 (the admin web app uses Tailwind v4
// with @theme — different surface, deliberately). `--brand` is the white-label
// accent; this static teal matches the "Sunrise PG" demo accent in admin. The
// pre-auth per-PG repaint (GET /branding/:slug) is a feature-time concern.
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0d9488',
          foreground: '#ffffff',
        },
      },
    },
  },
  plugins: [],
};
