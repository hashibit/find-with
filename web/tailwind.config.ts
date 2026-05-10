import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1',
          600: '#4f46e5', 700: '#4338ca', 900: '#312e81',
        },
      },
    },
  },
  plugins: [],
};
export default config;
