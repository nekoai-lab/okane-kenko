/**
 * 検査値パネル（診断書の検査値表にあたるもの）
 *
 * **製品名が「健康診断」なのに、検査値の一覧が無かった。**
 * 同じ内容は本文の中に散らばっていたが、散文に埋めると拾い読みができない。
 * 健康診断書がまず数値の表を出して、そのあとに所見を書くのと同じ順序にする。
 *
 * 設計上の決めごと：
 * - **モバイルで2列、デスクトップで4列。** タイル格子は393pxでは1列に潰れて
 *   縦の羅列に戻ってしまうので、潰れても意味を保つ2列を下限にする
 * - 値が出せない項目は空欄にせず「—」と理由を書く（沈黙で誤解させない）
 * - 判定タイルは「アイコン＋ラベル＋色」の3点で出す（色だけで意味を伝えない）
 * - 数字を大きくするのはここだけにしない ── ここは**拾い読みの入口**で、
 *   根拠は下の本文と図が持つ。タイルだけで判断させない
 */
import s from "./page.module.css";

export interface Vital {
  /** 何の値か */
  label: string;
  /** 値そのもの。出せないときは "—" */
  value: string;
  /** 1行の補足。単位や前提を書く */
  note: string;
  /** 判定タイルだけ色とアイコンを持つ */
  tone?: "good" | "warn" | "muted";
  icon?: string;
}

export function Vitals({ items }: { items: Vital[] }) {
  if (items.length === 0) return null;
  return (
    <dl className={s.vitals}>
      {items.map((it) => (
        <div
          className={`${s.vitalTile} ${
            it.tone === "good" ? s.vitalGood : it.tone === "warn" ? s.vitalWarn : ""
          }`}
          key={it.label}
        >
          <dt className={s.vitalLabel}>{it.label}</dt>
          <dd className={s.vitalValue}>
            {it.icon ? (
              <span aria-hidden="true" className={s.vitalIcon}>
                {it.icon}
              </span>
            ) : null}
            {it.value}
          </dd>
          <p className={s.vitalNote}>{it.note}</p>
        </div>
      ))}
    </dl>
  );
}
