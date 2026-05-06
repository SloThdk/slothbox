// Tailwind v4 uses a dedicated PostCSS plugin. Anything else here would be a
// regression — v4 is intentionally CSS-first.

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
