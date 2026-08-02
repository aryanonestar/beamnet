// tailwind.config.ts

import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "hsl(170, 70%, 40%)",
        accent: "hsl(260, 70%, 50%)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: [""],
      },
    },
  },
  plugins: [],
} satisfies Config;
