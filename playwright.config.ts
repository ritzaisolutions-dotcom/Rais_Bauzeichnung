import { defineConfig, devices } from "@playwright/test";

const PORT = 3021;

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // no key: the AI routes must answer with a clear error instead of crashing
    env: { ANTHROPIC_API_KEY: "" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 950 }, launchOptions: { args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] } },
    },
  ],
});
