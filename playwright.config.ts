import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  retries: 0,
  reporter: "list",
  use: {
    headless: true,
    baseURL: "http://0.0.0.0:5173",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "api",
      testMatch: "api/**/*.spec.ts",
      timeout: 60_000,
    },
    {
      name: "ui",
      testMatch: "ui/**/*.spec.ts",
      timeout: 60_000,
    },
    {
      name: "llm",
      testMatch: "llm/**/*.spec.ts",
      timeout: 120_000,
    },
  ],
});
