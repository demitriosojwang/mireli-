import type { Config } from "tailwindcss";

/**
 * The console uses CSS custom properties (defined in globals.css) rather than
 * Tailwind's default palette for brand and semantic colours. That means colour
 * lives in ONE place, can be re-themed, and — importantly — always pairs with a
 * text label in the markup rather than being the only signal.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--mi-canvas)",
        surface: "var(--mi-surface)",
        navy: "var(--mi-navy)",
        orange: "var(--mi-orange)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;