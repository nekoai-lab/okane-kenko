import { defineConfig } from "vitest/config";

/**
 * ベイクオフ（モデル比較）専用の設定。`npm test` からは切り離してある。
 *
 * 理由：ハーネスは実APIを叩いて課金が発生する。pre-commit が走らせる `npm test` に
 * 混ぜると、commit のたびに金が出て、ネットワークが無いと commit できなくなる。
 */

// .env.local の実値をここで読み込む（Vite は VITE_ 接頭辞の無い値を process.env に載せないため）。
// 鍵が無くても落とさない ─ ハーネス側が skip する。
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local が無い＝鍵未設定。bakeoff は skip される。
}

export default defineConfig({
  test: {
    include: ["scripts/bakeoff.test.ts"],
    reporters: ["verbose"],
    // モデル数 × 世帯数 の実API呼び出しを1本で回すので、既定のタイムアウトでは足りない
    testTimeout: 600_000,
  },
});
