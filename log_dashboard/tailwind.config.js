/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
    colors: {
      ...colors,
      'main-background': 'rgb(23, 24, 31)', 
      'border-white': 'rgb(238, 237, 240)',
    },
  },
  plugins: [],
}

