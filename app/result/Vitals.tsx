/**
 * 検査値パネル（診断書の検査値表にあたるもの）
 *
 * **製品名が「健康診断」なのに、検査値の一覧が無かった。**
 * 同じ内容は本文の中に散らばっていたが、散文に埋めると拾い読みができない。
 * 健康診断書がまず数値の表を出して、そのあとに所見を書くのと同じ順序にする。
 *
 * 構造の決めごと：
 * - **判定はここに置かない。** すぐ上の h1 が結論そのもので、繰り返しになる。
 *   ここは「測定値」だけにして、4つのセルの性格をそろえる（そろっていないと表に見えない）
 * - **1枚の表として組む。** 独立したカードを4つ浮かべるのではなく、1px の罫線で仕切る。
 *   検査値表は罫線で区切られた1つの表であって、チップの集まりではない
 * - **色を使うのは過不足のセルだけ。** 4つとも色を付けると、どれが要点か分からなくなる
 * - 数字は等幅（`tabular-nums`）にして、桁を縦にそろえる
 * - 値が出せないときは空欄にせず「—」と理由を書く（沈黙で誤解させない）
 */
import s from "./page.module.css";

export interface Vital {
  /** 何の値か。**verdict で意味が変わる項目は、呼び名も変える**（同じ名前で別の数を出さない） */
  label: string;
  /** 値そのもの。出せないときは "—" */
  value: string;
  /** 1行の補足。単位や前提を書く */
  note: string;
  /** 過不足のセルだけ色を持つ。それ以外は中立 */
  tone?: "good" | "warn";
}

export function Vitals({
  items,
  twoColumns = false,
}: {
  items: Vital[];
  /** 文章の列（720px）に置くときは2列にする。4列だとラベルが潰れる */
  twoColumns?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <dl className={`${s.vitals} ${twoColumns ? s.vitalsTwo : ""}`}>
      {items.map((it) => (
        <div className={s.vitalTile} key={it.label}>
          <dt className={s.vitalLabel}>{it.label}</dt>
          <dd
            className={`${s.vitalValue} ${
              it.tone === "good" ? s.vitalGood : it.tone === "warn" ? s.vitalWarn : ""
            }`}
          >
            {it.value}
          </dd>
          <p className={s.vitalNote}>{it.note}</p>
        </div>
      ))}
    </dl>
  );
}
