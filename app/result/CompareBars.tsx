/**
 * 支出と収入の対比（結果画面の主グラフ）
 *
 * `docs/デザイン方針.md`「グラフの設計」の規定そのまま：
 * - 横向きの積み上げ棒を2本、**同じ縮尺**で上下に並べて長さを直接比べさせる
 * - 色相は「支出＝オレンジ／収入＝ブルー」という**意味**を持たせ、内訳は明度差で分ける
 *   （10項目を別々の色にすると識別が破綻する。伝えたいのは「出ていく／入ってくる」の対比）
 * - セグメントの間に2pxの隙間（隣接した塗りが混ざって見えるのを防ぐ）
 * - **差引きの結果はグラフから引き算させない。** ヒーロー数字（必要な保障額の目安）が別にある
 * - 棒は装飾。数字は下の内訳表が正で、棒には aria-hidden を付ける（色だけで意味を伝えない）
 *
 * 依存ライブラリは足していない。積み上げ棒はトークンと CSS で足りるうえ、
 * この1枚のために描画ライブラリを入れると初回読み込みが重くなる（主戦場は LINE 内ブラウザ）。
 */
import { formatMan } from "../../src/design/tokens.js";
import s from "./page.module.css";

export interface BarItem {
  label: string;
  amount: number;
}

function Bar({
  title,
  total,
  items,
  scale,
  kind,
}: {
  title: string;
  total: number;
  items: BarItem[];
  scale: number;
  kind: "expense" | "income";
}) {
  return (
    <div className={s.barBlock}>
      <div className={s.barHead}>
        <span>{title}</span>
        <strong className={s.rowAmount}>{formatMan(total)}</strong>
      </div>
      <div className={s.bar} aria-hidden="true">
        {items.map((it, i) => (
          <span
            key={it.label}
            className={s.barSeg}
            style={{
              width: `${(it.amount / scale) * 100}%`,
              // 明度の段は5つまで。項目が増えたら最後の色を繰り返す（色を足さない）
              background: `var(--chart-${kind}-${Math.min(i + 1, 5)})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 2本を同じ縮尺で描く。長い方を100%にするので、短い方の短さがそのまま「差」に見える。
 */
export function CompareBars({
  caption,
  expense,
  income,
  expenseTotal,
  incomeTotal,
}: {
  caption: string;
  expense: BarItem[];
  income: BarItem[];
  expenseTotal: number;
  incomeTotal: number;
}) {
  const scale = Math.max(expenseTotal, incomeTotal);
  if (scale <= 0) return null;

  return (
    <div className={s.compare}>
      <div className={s.subhead}>{caption}</div>
      <Bar
        items={expense}
        kind="expense"
        scale={scale}
        title="出ていくお金（見込みの支出）"
        total={expenseTotal}
      />
      <Bar
        items={income}
        kind="income"
        scale={scale}
        title="入ってくるお金（公的年金・就労収入・資産）"
        total={incomeTotal}
      />
      <p className={s.basis}>
        ※ 2本は同じ縮尺です。内訳の色は下の表の印と対応しています（金額は下の表が正です）。
      </p>
    </div>
  );
}
