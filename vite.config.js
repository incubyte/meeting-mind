import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path"; // Make sure to install @types/node if using TypeScript

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Important for Electron: Ensure relative paths are used for assets
  base: "./",
  build: {
    // Output directory for the renderer process build
    outDir: "dist/renderer",
  },
  resolve: {
    alias: {
      // Example alias (optional)
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
