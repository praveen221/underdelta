import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  reporter: "line",
  use: { browserName: "chromium", headless: true },
});
