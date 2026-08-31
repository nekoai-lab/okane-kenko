/**
 * 引き算が見えるグラフ（ウォーターフォール）
 *
 * 「支出の合計から、受け取れるものを順に引いて、残りがこれ」という**手続きそのもの**を見せる。
 * 総額と結論だけを並べると、読み手には根拠がブラックボックスに見える（2026-08-30 の指摘）。
 *
 * 設計上の決めごと：
 * - 引く項目は**内訳表と1対1**。同じ色の印を使い、グラフと表を目で突き合わせられるようにする
 * - **不足はオレンジ（Warning）。赤は使わない。** 赤はシステムエラー専用で、
 *   保障の不足はエラーではない（`docs/デザイン方針.md`）。煽らないための決めごと
 * - 足りているときは 0 の棒を出さず、Success で「不足なし」と言い切る（良い知らせは良い知らせとして届ける）
 * - 棒は装飾。金額はすべて文字で併記し、棒には aria-hidden を付ける（色だけで意味を伝えない）
 * - 横向きの段組みにしたのは、主戦場が LINE 内ブラウザ（幅393px）で、縦棒5本だと
 *   ラベルが潰れるため。描画ライブラリは足していない
 *
 * 注：この形は `docs/デザイン方針.md`「グラフの設計」の当初の規定（差引きはグラフから
 * させない）を変更したもの。変更の理由は ADR に残すこと。
 */
import { formatMan } from "../../src/design/tokens.js";
import s from "./page.module.css";

export interface WaterfallItem {
  label: string;
  amount: number;
}

export function GapWaterfall({
  caption,
  expenseTotal,
  income,
  verdict,
}: {
  caption: string;
  expenseTotal: number;
  income: WaterfallItem[];
  verdict: string;
}) {
  if (expenseTotal <= 0) return null;

  // 縮尺は「支出の合計」。ここから引いていくので、これが必ず最長になる
  const scale = expenseTotal;
  let cursor = expenseTotal;
  const steps = income.map((it, i) => {
    const from = Math.max(0, cursor - it.amount);
    const row = {
      label: it.label,
      amount: it.amount,
      // 引かれる区間を、右端から順に左へ寄せて描く（段が下りていくのが見える）
      left: (from / scale) * 100,
      width: (Math.min(it.amount, cursor) / scale) * 100,
      color: `var(--chart-income-${Math.min(i + 1, 5)})`,
    };
    cursor = from;
    return row;
  });

  const remaining = Math.max(0, cursor);
  const covered = remaining === 0;

  return (
    <div className={s.compare}>
      <h3 className={s.h3}>{caption}</h3>

      <div className={s.wfRow}>
        <span className={s.wfLabel}>見込みの支出の合計</span>
        <span className={s.wfTrack} aria-hidden="true">
          <span
            className={s.wfBar}
            style={{ left: 0, width: "100%", background: "var(--chart-expense-2)" }}
          />
        </span>
        <span className={s.wfAmount}>{formatMan(expenseTotal)}</span>
      </div>

      {steps.map((r) => (
        <div className={s.wfRow} key={r.label}>
          <span className={s.wfLabel}>− {r.label}</span>
          <span className={s.wfTrack} aria-hidden="true">
            <span
              className={s.wfBar}
              style={{ left: `${r.left}%`, width: `${r.width}%`, background: r.color }}
            />
          </span>
          <span className={s.wfAmount}>−{formatMan(r.amount)}</span>
        </div>
      ))}

      <div className={`${s.wfRow} ${s.wfResult}`}>
        <span className={s.wfLabel}>{covered ? "残り（不足なし）" : "残り（足りない分）"}</span>
        <span className={s.wfTrack} aria-hidden="true">
          {!covered && (
            <span
              className={s.wfBar}
              style={{
                left: 0,
                width: `${(remaining / scale) * 100}%`,
                background: "var(--color-verdict-shortage)",
              }}
            />
          )}
        </span>
        <span className={s.wfAmount}>
          {covered ? (
            <span className={s.wfGood}>✓ 0円</span>
          ) : (
            <strong className={s.wfWarn}>⚠ {formatMan(remaining)}</strong>
          )}
        </span>
      </div>

      <p className={s.basis}>
        ※ 支出の合計から、受け取れる見込みのものを順に引いています。色の印は下の内訳表と対応します。
        {covered
          ? verdict === "ample"
            ? "収入・資産が支出を大きく上回るため、上乗せの保障は要りません。"
            : "支出はまかなえる見込みです。上の金額は不足額ではなく、当座資金の目安です。"
          : "この残りが、保険などで備える対象になります。"}
      </p>
    </div>
  );
}
