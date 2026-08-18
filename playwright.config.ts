import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // デモモードは1つの開発サーバー内でインメモリの業務データを共有するため、
  // E2Eは直列で実行して画面状態が別ケースに干渉しないようにする。
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "APP_ENV=local DEMO_MODE=true npm run dev",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
