import { defineConfig, devices } from "@playwright/test";

/**
 * E2E / モバイル崩れ確認（T-03/T-04 完了条件）
 *
 * LINE 内ブラウザ相当の狭い幅で、ウィザードが崩れず結果まで到達できることを見る。
 * dev サーバを自動起動する。ブラウザは chromium（headless shell）。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://localhost:3300" },
  // Pixel 5＝chromium ベースのモバイル幅（393px）。LINE 内ブラウザ相当の狭さ。
  projects: [{ name: "mobile", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: "PORT=3300 npm run dev",
    url: "http://localhost:3300/wizard",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
