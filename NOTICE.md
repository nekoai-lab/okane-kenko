# サードパーティ ライセンス表記

このソフトウェア本体のライセンスは [`LICENSE`](./LICENSE)（MIT）です。
以下は、このプロジェクトが依存している主なオープンソースソフトウェアと、そのライセンスです。
各ライセンスの全文は、それぞれのパッケージ（`node_modules/<name>/LICENSE`）に含まれます。

## 実行時に使うもの

| パッケージ | 版 | ライセンス | 用途 |
|---|---|---|---|
| [next](https://github.com/vercel/next.js) | 15.5.23 | MIT | アプリの器（App Router・API ルート） |
| [react](https://github.com/facebook/react) | 19.2.8 | MIT | UI |
| [react-dom](https://github.com/facebook/react) | 19.2.8 | MIT | UI |
| [firebase-admin](https://github.com/firebase/firebase-admin-node) | 14.4.0 | Apache-2.0 | Firestore（世帯記録・承認キュー） |
| [yaml](https://github.com/eemeli/yaml) | 2.9.0 | ISC | 制度パラメータ（`params/*.yaml`）の読み込み |
| [zod](https://github.com/colinhacks/zod) | 3.25.76 | MIT | API の入力検証 |

## 開発時に使うもの

| パッケージ | 版 | ライセンス | 用途 |
|---|---|---|---|
| [typescript](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | 型チェック |
| [vitest](https://github.com/vitest-dev/vitest) | 2.1.9 | MIT | ユニットテスト（ゴールデンテスト） |
| [@playwright/test](https://github.com/microsoft/playwright) | 1.62.1 | Apache-2.0 | E2E テスト |
| [@biomejs/biome](https://github.com/biomejs/biome) | 2.5.8 | MIT OR Apache-2.0 | Formatter / Linter |

## 外部サービス

コードとして同梱していないが、実行時に利用するもの。

| サービス | 用途 | 備考 |
|---|---|---|
| Google Cloud Run / Cloud Build / Secret Manager / Firestore | 実行環境・デプロイ・秘密情報・保存 | |
| Gemini API（`gemini-3.7-flash`） | 結果の言語化。**金額は生成させない**（プレースホルダのみ） | 鍵が無い場合はテンプレートで動作する |
| Slack Incoming Webhook | 気づき通知の投稿。**金額を含めない** | |

## 出典（コードではなくデータ）

制度パラメータの出典は `params/*.yaml` の各項目に `source` として記録し、結果画面にも表示しています。

- 日本年金機構「遺族基礎年金（受給要件・対象者・年金額）」
- 厚生年金保険法（遺族厚生年金・中高齢寡婦加算）
- 全国健康保険協会「高額療養費」
- 文部科学省「子供の学習費調査」「高校生等への就学支援」

> 「当社基準」と表示している値（遺族生活費率・手取り率・末子独立後の就労推定など）は
> **公的出典のない自社の見立て**であり、結果画面でもそのように明示しています。
