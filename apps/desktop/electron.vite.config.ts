import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { build, type Plugin } from "vite";

// Everything except Electron itself is bundled: @vn/core is TypeScript sources in the workspace,
// and without external dependencies packaging (electron-builder) does not depend on node_modules.
const bundleAll = { externalizeDeps: false };

/**
 * out/main/mcp-bridge.js — the MCP bridge for the Claude app (src/main/mcp/bridge.ts). It is started
 * by another process (VNami in Node mode), so it must be a standalone file: a separate build, because one shared
 * with index.js would pull the whole app into the bridge.
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
    // The window is sandboxed: preload must be a single file without external dependencies.
    build: { externalizeDeps: false },
  },
  renderer: {
    resolve: {
      alias: { "@renderer": resolve("src/renderer/src") },
    },
    plugins: [react(), tailwindcss()],
  },
});
