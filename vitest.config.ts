import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 * Runs unit tests under the Node environment (faster than jsdom for pure
 * prompt-builder tests, since the builder has no DOM dependencies).
 * Path alias "@/" mirrors the Vite project alias for consistency.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
