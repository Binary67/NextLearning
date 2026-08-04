import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": repositoryRoot,
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
