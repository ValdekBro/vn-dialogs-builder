import { defineConfig } from "@playwright/test";

/** README media (screenshots and GIFs) recorded from the real app: `pnpm showcase`. Not part of `pnpm e2e`. */
export default defineConfig({
  testDir: "showcase",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "showcase-results",
});
