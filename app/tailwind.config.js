/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fire: { DEFAULT: "#ff5a1f", light: "#ff8a3d" },
        ink: { 950: "#0a0a0b", 900: "#111113", 800: "#1a1a1d", 700: "#26262a" },
      },
    },
  },
  plugins: [],
};
