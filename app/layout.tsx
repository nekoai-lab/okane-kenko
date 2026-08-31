import type { ReactNode } from "react";
import { loadParams, unverifiedKeys } from "../src/params/index.js";
import "../src/design/tokens.css";
import s from "./layout.module.css";

export const metadata = {
  title: "お金の健康診断",
  description: "必要保障の過不足を、根拠つきで返す診断",
  // **検証ビルドの間は検索エンジンに載せない。**
  // 「次の一歩」「選ぶ基準」の文面は保険業法の正式レビュー（OI-01）前のサンプルで、
  // 年金額も令和8年度の報道値（verified:false）。この状態のページが検索から
  // 見つかる状態にはしない。本番公開の判断が出たときに、この1行を外す。
  robots: { index: false, follow: false },
};

/**
 * 「これは検証版です」を**口頭の補足に頼らず、画面の側から必ず出す**。
 *
 * 人に見せるとき「概算の検証版だと伝える」を運用ルールにすると、いつか忘れる。
 * 忘れた回だけ、相手が確定値だと思って持ち帰る ── エラーも出ないので誰も気づかない。
 * だから告知はページの構造に置き、**未確認パラメータの有無から自動で決める**。
 *
 * 判定は本番ゲート（assertUsable の strictVerified）と同じ `unverifiedKeys` を使う。
 * したがって全部 verified になればバナーは自然に消え、残っている限り消せない。
 * 読み込みに失敗したときも出す（状態が分からないなら、注意書きは出す側に倒す）。
 */
function isDraftBuild(): boolean {
  try {
    return unverifiedKeys(loadParams()).length > 0;
  } catch {
    return true;
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {isDraftBuild() && (
          <div className={s.draftBanner} role="note">
            <div className={s.draftBannerInner}>
              これは<strong>検証版</strong>です。金額は概算で、確定した値ではありません。
              制度の数値に、一次情報でまだ確認できていないもの（令和8年度の年金額など）が含まれます。
            </div>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
