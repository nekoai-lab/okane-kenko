/**
 * 判定を支えている前提の開示ブロック（仕様 §5.3 T-A / T-E）
 *
 * **死亡の2カード（本人・配偶者）で共通に使う。** 片方だけ直して食い違うのを防ぐ。
 *
 * 開示の原則（CLAUDE.md「開示の見せ方」）：
 * **決定的な前提は初期表示、それ以外は件数を明示した1タップの奥に置く。**
 * 初期表示に出すのは2つだけ ──
 *   ① 帯：見込んだ収入のうち、どれだけがその前提に乗っているか
 *   ② 感度文1文：その前提が外れたら、判定と金額がどう動くか
 *
 * 2026-09-21 の実測で、6項目を全部並べると図も大きな数字も無い区間が 975px
 * （390×844 の1画面ぶん）できて、視覚の DoD (a) を割った。
 * **開示を減らすのではなく、決定的な1点を前に出して残りを畳む**ことで両立させる。
 *
 * **金額も判定も、ここでは作らない。** すべて `simulate` の出力から来た文字列を描くだけ。
 */
import s from "./riskTable.module.css";

/** 前提の重み。`share` は帯の描画にだけ使う比率（0〜1）で、画面に出す金額は文字列のほう */
export interface PremiseWeight {
  share: number;
  totalText: string;
  onPremiseText: string;
}

/** 前提が外れたときに判定と金額がどう動くか（T-E）。文は組み立て済みで渡す */
export interface PremiseSensitivity {
  text: string;
}

export interface PremiseDisclosureProps {
  weight: PremiseWeight | null;
  sensitivity: PremiseSensitivity | null;
  /** 畳む側の項目。見出し語＋1行 */
  items: { label: string; note: string }[];
}

export function PremiseDisclosure({ weight, sensitivity, items }: PremiseDisclosureProps) {
  if (!weight && !sensitivity && items.length === 0) return null;

  return (
    <div className={s.premises}>
      {weight && (
        <div className={s.weight}>
          <div
            className={s.weightBar}
            role="img"
            aria-label={`見込んだ収入 ${weight.totalText} のうち ${weight.onPremiseText} が、遺されたご家族の就労収入です。`}
          >
            <span style={{ width: `${Math.round(weight.share * 100)}%` }} />
          </div>
          <p className={s.weightNote}>
            見込んだ収入 {weight.totalText} のうち <b>{weight.onPremiseText}</b>{" "}
            が、遺されたご家族の就労収入です
          </p>
        </div>
      )}

      {sensitivity && (
        <>
          <p className={s.premisesHead}>判定を支えている前提</p>
          <p className={s.sensitivity}>{sensitivity.text}</p>
        </>
      )}

      {items.length > 0 && (
        // **件数を出す。** 「すべて見る」だけだと、何件隠れているのか分からない
        <details className={s.premisesMore}>
          <summary>計算の前提をすべて見る（{items.length}項目）</summary>
          <ul className={s.premisesList}>
            {items.map((a) => (
              <li key={a.label}>
                <b className={s.premisesLabel}>{a.label}</b>
                {a.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
