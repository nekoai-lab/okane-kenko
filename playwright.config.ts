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
    // 鍵は**わざと形の違うダミー**を渡す。E2E で実LLMを呼ぶと課金が発生し、生成文が
    // 毎回変わって落ち方も読めなくなるため。形の検査で弾かれるので外部通信は起きず、
    // それでも「AIを呼ぶ画面」の経路（ストリーミング受信・退避）は通る。
    command: "GEMINI_API_KEY=e2e-dummy-not-a-real-key PORT=3300 npm run dev",
    url: "http://localhost:3300/wizard",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
