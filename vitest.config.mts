import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB を使うテストは npm run test:db で別に流す（vitest.db.config.mts）
    exclude: ["src/**/*.db.test.ts", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
