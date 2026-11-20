/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * **開発インジケータ（画面下の黒丸）を出さない**（2026-09-21）。
   *
   * 実測とスクリーンショットに写り込み、**本文が隠れているように見える**。
   * レビューのノイズになるだけでなく、視覚の DoD (a) の実測でも
   * 本文の上に重なった状態で測ることになる。
   * 本番ビルドには元から出ないので、開発時だけの見え方をそろえる。
   */
  devIndicators: false,
  // Cloud Run に載せるため、依存ごと1つに畳んだ出力を作る（Dockerfile がこれを使う）。
  // Vercel に出す場合も無害（Vercel は独自にビルドする）。
  output: "standalone",
  // 算定は params/*.yaml を実行時に readFileSync で読む（src/params/index.ts）。
  // Vercel のサーバーレス関数トレースは実行時パスを追えないので、明示的に同梱する。
  // これを忘れると本番だけ「パラメータが見つかりません」で静かに壊れる。
  // params を読むのは /api/diagnose だけではない。結果画面（/result）も
  // AI言語化（/api/narrate）も loadParams を呼ぶ。ここに列挙し漏れると、
  // **本番だけ「パラメータが見つかりません」で落ちる**（ローカルでは cwd に params があるので気づけない）。
  // 経路を足したら必ずここも足すこと。
  outputFileTracingIncludes: {
    "/api/diagnose": ["./params/**"],
    "/api/narrate": ["./params/**"],
    "/result": ["./params/**"],
  },
  // src/ は .ts を .js 拡張子で import する（bundler 解決前提）。src/ 側は触らない。
  // Next 16 の next build は既定で Turbopack になり、webpack の extensionAlias は効かない。
  // 相対 .js import はローダーで .ts → .tsx → .js の順に解決する。
  // resolveAlias は相対 import の extensionAlias の代わりにはならない。
  turbopack: {
    rules: {
      "*.{ts,tsx}": {
        condition: { not: "foreign" },
        loaders: ["./scripts/typescript-extension-loader.cjs"],
      },
    },
  },
};

export default nextConfig;
