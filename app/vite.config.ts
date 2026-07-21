import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base is "./" so the build works at any GitHub Pages preview path.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "./",
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
