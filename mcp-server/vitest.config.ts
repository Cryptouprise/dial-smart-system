import { defineConfig } from "vitest/config";

export default defineConfig({
  // This package is a pure Node MCP server. Override PostCSS with an inline
  // empty config so Vitest doesn't walk up to the parent repo's postcss.config.js
  // and try to load tailwindcss (which isn't installed here).
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
