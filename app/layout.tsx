import type { ReactNode } from "react";
import "../src/design/tokens.css";

export const metadata = {
  title: "お金の健康診断",
  description: "必要保障の過不足を、根拠つきで返す診断",
  // **検証ビルドの間は検索エンジンに載せない。**
  // 「次の一歩」「選ぶ基準」の文面は保険業法の正式レビュー（OI-01）前のサンプルで、
  // 年金額も令和8年度の報道値（verified:false）。この状態のページが検索から
  // 見つかる状態にはしない。本番公開の判断が出たときに、この1行を外す。
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
