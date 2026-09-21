/**
 * STEP1「あなたが答えたこと」（仕様 §5.3・照合表 #5）
 *
 * **移植元は `docs/design-mock/result.html` の STEP 1。**
 * 回答チップ（答えた＝白）と、推定で補った項目（橙＋補い方の理由1行）。
 *
 * ここが受け持つのは「計算の出発点を見せる」こと。
 * **旧セクション h2「この診断が前提にした、いまの家計」と h3「推定で補った前提」を
 * まとめて置き換える**（同じ情報を2か所で出さない）。
 *
 * **答えた項目と推定で補った項目を、同じ白いチップに混ぜない。**
 * 混ぜると、答えていないものが「答えたこと」の列に並ぶ。
 * 推定の項目は白チップから抜き、値と補い方の理由をセットで橙側に出す
 * ── 色だけで区別すると、色が見えない読み方（読み上げ・印刷）で区別が消える。
 *
 * **数値はここで作らない。** 呼び出し側が回答から作った文字列を描くだけ。
 */
import Link from "next/link";
import s from "./step1.module.css";

/** 回答チップ1つ。`field` はウィザードの項目名で、推定の記録と突き合わせるために持つ */
export interface AnswerChip {
  /** ウィザードの項目名。突き合わせる相手が無い項目（年齢など）は null */
  field: string | null;
  text: string;
}

export interface Step1Props {
  chips: AnswerChip[];
  /**
   * 推定で補った項目（橙）。**出どころはウィザードの `normalize()` の記録**であって、
   * 算定側の `assumptions[]` ではない。
   *
   * 両者は別物：ここに出すのは「**答えなかったので補った**」項目で、
   * 算定側の `assumptions[]` は「回答の有無にかかわらず算定が置いている前提」を含む
   * （65歳まで／新しい貯蓄はゼロ、など）。混ぜると、答えたはずの項目まで
   * 「推定で補った」と名指すことになる。**後者の完全な記録は診断表の前提開示が持つ。**
   */
  estimations: { field: string; label: string; note: string }[];
  /**
   * チップに出た専門用語の1行注釈（CLAUDE.md「専門用語は初出で1行注釈」）。
   *
   * **旧「この診断が前提にした、いまの家計」から引き取った責務。**
   * あちらの住まいの欄が団信の初出注釈を負っていたので、
   * 撤去するならその注釈もここに移さないと、以降の「回答: 団信あり」が無注釈の初出になる。
   */
  terms: string[];
  /** 入力に戻るリンク */
  editHref: string;
}

export function Step1({ chips, estimations, terms, editHref }: Step1Props) {
  const estimated = new Map(estimations.map((e) => [e.field, e]));
  const answered = chips.filter((c) => c.field === null || !estimated.has(c.field));
  /** 推定の項目は、補い方の理由の上に**その項目の値**を出す（チップと同じ情報を橙側に移す） */
  const chipTextOf = (field: string) => chips.find((c) => c.field === field)?.text ?? null;

  return (
    <section className={s.wrap} aria-labelledby="step1-heading">
      <div className={s.head}>
        <span className={s.num}>1</span>
        <div>
          <h2 className={s.title} id="step1-heading">
            あなたが答えたこと
          </h2>
          <p className={s.sub}>
            10問の回答が計算の出発点です。答えなかった項目は「推定」として色を分けて残します。
          </p>
        </div>
      </div>

      <ul className={s.chips}>
        {answered.map((c) => (
          <li className={s.chip} key={c.text}>
            {c.text}
          </li>
        ))}
      </ul>

      {terms.length > 0 && (
        <ul className={s.terms}>
          {terms.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      {/* **0件を沈黙で済ませない**（「減らせる箇所」と同じ扱い）。
          推定が無いことは良い知らせなので、無いと書く */}
      {estimations.length === 0 && (
        <p className={s.noEstimate}>
          推定で補った項目はありません（10問すべてにお答えいただいています）。
        </p>
      )}

      {estimations.length > 0 && (
        <div className={s.estimates}>
          <p className={s.estimatesHead}>推定で補った項目（{estimations.length}件）</p>
          {estimations.map((e) => (
            <div className={s.estimate} key={e.field}>
              <p className={s.estimateName}>{chipTextOf(e.field) ?? e.label}</p>
              <p className={s.estimateNote}>{e.note}</p>
            </div>
          ))}
          <p className={s.estimatesFoot}>
            未回答は1つの数字で決めつけず、幅で計算して結果にも幅として残します。
          </p>
        </div>
      )}

      <p className={s.edit}>
        違っていたら{" "}
        <Link className={s.link} href={editHref}>
          入力をやり直せます
        </Link>
        。前提が変われば結論も変わります。
      </p>
    </section>
  );
}
