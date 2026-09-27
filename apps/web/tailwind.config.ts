import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        western: {
          purple: "#4c1e63",
          gold: "#c1c6c8",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
