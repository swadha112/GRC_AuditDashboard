import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Horizon-style absolute imports
      layouts: path.resolve(__dirname, "src/layouts"),
      components: path.resolve(__dirname, "src/components"),
      views: path.resolve(__dirname, "src/views"),
      variables: path.resolve(__dirname, "src/variables"),
      assets: path.resolve(__dirname, "src/assets"),
      // optional: allow "@/..." if you prefer later
      "@": path.resolve(__dirname, "src")
    }
  }
});
