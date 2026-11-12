import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { build, type Plugin } from "vite";

// Усе, крім самого Electron, вбудовуємо в бандл: @vn/core — це TypeScript-джерела у воркспейсі,
// а без зовнішніх залежностей пакування застосунку (electron-builder) не залежить від node_modules.
const bundleAll = { externalizeDeps: false };

/**
 * out/main/mcp-bridge.js — міст MCP для застосунку Claude (src/main/mcp/bridge.ts). Його запускає
 * інший процес (VNami в режимі Node), тож він має бути самостійним файлом: окрема збірка, бо спільна
 * з index.js тягнула б у міст увесь застосунок.
 */
function mcpBridge(): Plugin {
  return {
    name: "vnami-mcp-bridge",
    apply: "build",
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: "warn",
        build: {
          ssr: resolve("src/main/mcp-bridge.ts"),
          outDir: resolve("out/main"),
          emptyOutDir: false,
          target: "node22",
          minify: false,
          rollupOptions: { output: { format: "cjs", entryFileNames: "mcp-bridge.js" } },
        },
      });
    },
  };
}

export default defineConfig({
  main: {
    build: bundleAll,
    plugins: [mcpBridge()],
  },
  preload: {
    // Вікно працює в пісочниці: preload має бути одним файлом без зовнішніх залежностей.
    build: { externalizeDeps: false },
  },
  renderer: {
    resolve: {
      alias: { "@renderer": resolve("src/renderer/src") },
    },
    plugins: [react(), tailwindcss()],
  },
});
