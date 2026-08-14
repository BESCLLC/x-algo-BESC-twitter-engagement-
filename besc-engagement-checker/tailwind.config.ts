import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#05060a",
        surface: "#0b0d14",
        panel: "#11131c",
        line: "#1f2230",
        besc: {
          50: "#eefcf6",
          100: "#d3f8e7",
          200: "#a3efd0",
          300: "#68e0b4",
          400: "#33cb98",
          500: "#14b381",
          600: "#0a9169",
          700: "#0a7456",
          800: "#0c5c46",
          900: "#0c4b3b",
        },
        volt: "#c8ff4d",
        signal: "#7c5cff",
        danger: "#ff5c7c",
        warn: "#ffb547",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(20, 179, 129, 0.5)",
        "glow-lg": "0 0 80px -20px rgba(124, 92, 255, 0.45)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, transparent, rgba(5,6,10,1)), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },
      keyframes: {
        aurora: {
          "0%, 100%": { transform: "translate(0%, 0%) rotate(0deg)" },
          "50%": { transform: "translate(4%, -6%) rotate(6deg)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "80%, 100%": { transform: "scale(1.6)", opacity: "0" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        aurora: "aurora 22s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.2,0.6,0.4,1) infinite",
        rise: "rise 0.5s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
