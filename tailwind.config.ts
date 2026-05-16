import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        bengali: ["'Hind Siliguri'", "sans-serif"],
        sans: ["'Hind Siliguri'", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#1B6CA8",
          50: "#EBF4FB",
          100: "#C8E2F4",
          200: "#91C5E9",
          300: "#5AA8DE",
          400: "#2D8BCF",
          500: "#1B6CA8",
          600: "#155487",
          700: "#0F3D63",
          800: "#0A2840",
          900: "#05131F",
        },
        accent: {
          DEFAULT: "#F4A025",
          50: "#FEF6E7",
          100: "#FDE7BB",
          200: "#FAD077",
          300: "#F7B833",
          400: "#F4A025",
          500: "#E08A0D",
          600: "#AD6C0A",
          700: "#7A4D07",
          800: "#472D04",
          900: "#140E01",
        },
        success: "#22C55E",
        danger: "#EF4444",
        bg: {
          DEFAULT: "#F8F9FA",
          dark: "#0F172A",
        },
        card: {
          DEFAULT: "#FFFFFF",
          dark: "#1E293B",
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        card: "0 2px 16px 0 rgba(27,108,168,0.08)",
        nav: "0 -2px 20px 0 rgba(0,0,0,0.08)",
      },
      animation: {
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
      },
      keyframes: {
        slideUp: {
          from: { transform: "translateY(20px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        scaleIn: {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
