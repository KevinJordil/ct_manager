/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // A field green, taken down in saturation so long lists stay
        // readable. It replaces the default blue as the accent; nothing in
        // the interface is coloured for decoration.
        olive: {
          50: '#f4f6f0',
          100: '#e6ead9',
          200: '#ced6b8',
          300: '#aebb8f',
          400: '#8e9d68',
          500: '#72814d',
          600: '#59673b',
          700: '#454f2f',
          800: '#38402a',
          900: '#2f3625',
          950: '#181d12',
        },
      },
      fontFamily: {
        // Numbers line up in columns: plates, times and counts are read in
        // vertical scans, not sentences.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
