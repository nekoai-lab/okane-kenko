/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // src/ は .ts を .js 拡張子で import する（bundler 解決前提）。
  // webpack は .js→.ts の読み替えをしないので、明示する。src/ 側は触らない。
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
