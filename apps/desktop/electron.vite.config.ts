import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Усе, крім самого Electron, вбудовуємо в бандл: @vn/core — це TypeScript-джерела у воркспейсі,
// а без зовнішніх залежностей пакування застосунку (electron-builder) не залежить від node_modules.
const bundleAll = { externalizeDeps: false };

export default defineConfig({
  main: {
    build: bundleAll,
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
