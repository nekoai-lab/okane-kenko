/**
 * 単身世帯（`survivor === null`）の死亡詳細（仕様 §5.3・2026-09-21 オーナー決定）
 *
 * **扶養する相手がいない世帯では「遺族の生活」という物語が成立しない。**
 * `projectDeath` の算定期間は「遺される配偶者が65歳になるまで」なので、
 * 相手がいなければ 0年 ── `rows` が1行しか返らず、**STEP2〜4 は描く材料を持たない**。
 *
 * **空データで無理に描かない。「正直な空欄」の型で置き換える**
 * （診断表の `計算未対応` と同族。無い根拠で数字を置かないのと同じ考え）。
 *
 * 「遺族の生活費は対象外」は**欠落ではなく設計**。
 * 理由を書かずに空白にすると、読み手には壊れているように見える。
 *
 * **金額はここで作らない。** 受け取った額を描くだけ。
 */
import s from "./soloCase.module.css";

export function SoloCase({
  title,
  needText,
  needLabel,
}: {
  title: string;
  /** 葬儀・整理資金の額（整形済み） */
  needText: string;
  /** その額の呼び名（`AMOUNT_LABEL` からバインドする。手打ちしない） */
  needLabel: string;
}) {
  return (
    <div className={s.card}>
      <h2 className={s.title}>{title}</h2>

      <p className={s.lead}>
        遺す相手の回答がないため、<strong>遺族の生活費は対象外</strong>です。
        見るのは葬儀・整理資金だけです。
      </p>

      <div className={s.amountBlock}>
        <p className={s.amountLabel}>{needLabel}</p>
        <p className={s.amount}>{needText}</p>
      </div>

      {/*
        **どこを見ればよいかまで言う。** 「対象外」で終わる文は、読み手に
        「で、どうすれば」を残したまま終わる（CLAUDE.md の開示の規約）。
      */}
      <p className={s.guide}>
        この世帯で重いのは、ご自身の<strong>病気・就業不能・失業</strong>です。
        <a className={s.link} href="#risk-table-heading">
          上の健康診断表のその3行
        </a>
        を見てください。
      </p>
    </div>
  );
}
