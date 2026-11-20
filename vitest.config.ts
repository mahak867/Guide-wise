import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  // The "@/..." imports used by route handlers, so a route can be tested directly.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
