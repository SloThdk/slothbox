// Tailwind v4 configuration.
//
// Most theming has migrated to CSS-first declarations in `src/styles/globals.css`
// using the new `@theme` directive. This file exists only to declare the content
// glob (so the JIT picks up our class names) and to attach the optional plugins
// that have not yet shipped CSS-first equivalents.

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}", "./src/lib/**/*.{ts,tsx}"],
  // v4 uses CSS-first @theme — keep this minimal.
  theme: {},
  plugins: [],
};

export default config;
