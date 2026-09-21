/**
 * 年次の表（FPのキャッシュフロー表に相当するもの）
 *
 * **FPの表に対して勝つ点をはっきりさせて作る。**
 * FPのキャッシュフロー表は全年を等しく並べるだけで、「どの年が効くのか」は
 * 人間（FP）が対面で口頭で補っている。用語の注釈は無く、A3横前提でスマホでは読めない。
 * こちらは対面がない前提なので、**紙が自分で説明しきる**必要がある。
 *
 * そのために足したもの：
 * 1. **注目する年**を先に抜き出す（なぜ効くのかを1行で書く）。FPの表には無い
 * 2. **できごと列**を表に入れる（FPの「主なライフイベント」行にあたる）
 * 3. **配偶者の年齢**を入れる（FPは家族全員の年齢を並べる。こちらは死亡後の話なので
 *    生存者と子だけが意味を持つ）
 * 4. **収入・支出を項目別の表に分ける**。1枚に16列を詰めるとスマホでは読めないので、
 *    6列の表を3枚に割る（FPはA3横1枚に詰め込んでいる）
 * 5. **用語の注釈を表の中に置く**（団信・遺族基礎年金・遺族厚生年金・中高齢寡婦加算）。
 *    CLAUDE.md の「専門用語は初出で1行注釈」が結果画面で守られていなかった
 */
import type { Projection, ProjectionRow } from "../../src/calc/projection.js";
import { formatMan } from "../../src/design/tokens.js";
import s from "./page.module.css";

/** 表に出てくる制度の用語。**中学生が読める語彙で1行**（CLAUDE.md） */
const TERMS: { term: string; note: string }[] = [
  {
    term: "遺族基礎年金",
    note: "18歳までのお子さんがいる間、国から遺族に支払われる年金です。",
  },
  {
    term: "遺族厚生年金",
    note: "会社員・公務員だった方の遺族が受け取れる年金です。自営業の方には出ません。",
  },
  {
    term: "中高齢寡婦加算",
    note: "遺族基礎年金が終わったあと、40〜64歳の配偶者に上乗せされる分です。",
  },
];

function ages(row: ProjectionRow): string {
  const kids = row.ages.children.length > 0 ? `子${row.ages.children.join("・")}` : "";
  const sp = row.ages.survivor !== null ? `配偶者${row.ages.survivor}` : "";
  return [sp, kids].filter(Boolean).join("／") || "—";
}

function events(row: ProjectionRow): string {
  const e = row.events.filter((x) => x !== "診断の起点");
  return e.length > 0 ? e.join("・") : "";
}

function yen(v: number): string {
  return formatMan(v);
}

function signed(v: number): string {
  return `${v < 0 ? "▲" : ""}${formatMan(Math.abs(v))}`;
}

/**
 * 注目する年。**ここがFPの表には無い部分。**
 * 全年を等しく並べても、どこを見ればよいかは分からない。
 */
export function KeyYears({ pj }: { pj: Projection }) {
  const rows = pj.rows;
  if (rows.length < 2) return null;

  const picks: { row: ProjectionRow; why: string }[] = [];
  if (pj.tightest) {
    picks.push({ row: pj.tightest, why: "1年の収支がいちばん小さい年です" });
  }
  if (pj.depletedAt) {
    picks.push({ row: pj.depletedAt, why: "この前提のままだと、残高がマイナスになる年です" });
  }
  for (const r of rows) {
    const e = events(r);
    if (e && picks.length < 5 && !picks.some((p) => p.row.year === r.year)) {
      picks.push({ row: r, why: `${e}年です` });
    }
  }
  picks.sort((a, b) => a.row.year - b.row.year);
  if (picks.length === 0) return null;

  return (
    <div className={s.keyYears}>
      <h3 className={s.h3}>この期間で、とくに見ておきたい年</h3>
      <div className={s.cfTableWrap}>
        <table className={s.cfTable}>
          <thead>
            <tr>
              <th scope="col">西暦</th>
              <th scope="col">年齢</th>
              <th scope="col">年間収支</th>
              <th scope="col">年末の残高</th>
              <th className={s.cfWhy} scope="col">
                なぜ見ておくか
              </th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p) => (
              <tr className={p.row.balance < 0 ? s.cfRowNeg : undefined} key={p.row.year}>
                <th scope="row">{p.row.year}</th>
                <td>{ages(p.row)}</td>
                <td>{signed(p.row.net)}</td>
                <td>{signed(p.row.balance)}</td>
                <td className={s.cfWhy}>{p.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.basis}>単位は万円。年齢はその年の年末時点です。</p>
    </div>
  );
}

/** 全年の表。1枚に詰め込まず、まとめ・収入の内訳・支出の内訳の3枚に割る */
export function YearTables({ pj }: { pj: Projection }) {
  const rows = pj.rows;
  if (rows.length < 2) return null;

  return (
    <details className={s.criteria}>
      <summary>年ごとの表をすべて見る（{rows.length}年分・収入と支出の内訳つき）</summary>

      <p className={s.basis}>
        単位は万円。金額は概算で、四捨五入のため内訳の合計と一致しないことがあります。
        表は横にスクロールできます。
      </p>

      <h3 className={s.h3}>ことばの意味</h3>
      <dl className={s.terms}>
        {TERMS.map((t) => (
          <div className={s.termRow} key={t.term}>
            <dt className={s.termName}>{t.term}</dt>
            <dd className={s.termNote}>{t.note}</dd>
          </div>
        ))}
      </dl>

      <h3 className={s.h3}>1年ごとのまとめ</h3>
      <div className={s.cfTableWrap}>
        <table className={s.cfTable}>
          <thead>
            <tr>
              <th scope="col">西暦</th>
              <th scope="col">年齢</th>
              <th className={s.cfWhy} scope="col">
                できごと
              </th>
              <th scope="col">収入</th>
              <th scope="col">支出</th>
              <th scope="col">年間収支</th>
              <th scope="col">年末の残高</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className={r.balance < 0 ? s.cfRowNeg : undefined} key={r.year}>
                <th scope="row">{r.year}</th>
                <td>{ages(r)}</td>
                <td className={s.cfWhy}>{events(r)}</td>
                <td>{yen(r.income.total)}</td>
                <td>{yen(r.expense.total)}</td>
                <td>{signed(r.net)}</td>
                <td>{signed(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className={s.h3}>収入の内訳</h3>
      <div className={s.cfTableWrap}>
        <table className={s.cfTable}>
          <thead>
            <tr>
              <th scope="col">西暦</th>
              <th scope="col">遺族基礎年金</th>
              <th scope="col">遺族厚生年金</th>
              <th scope="col">中高齢寡婦加算</th>
              <th scope="col">ご家族の就労</th>
              <th scope="col">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <th scope="row">{r.year}</th>
                <td>{yen(r.income.pensionBasic)}</td>
                <td>{yen(r.income.pensionKosei)}</td>
                <td>{yen(r.income.chukoreiKafu)}</td>
                <td>{yen(r.income.work)}</td>
                <td>{yen(r.income.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className={s.h3}>支出の内訳</h3>
      <div className={s.cfTableWrap}>
        <table className={s.cfTable}>
          <thead>
            <tr>
              <th scope="col">西暦</th>
              <th scope="col">生活費</th>
              <th scope="col">教育費</th>
              <th scope="col">住居費</th>
              <th scope="col">葬儀・予備費</th>
              <th scope="col">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <th scope="row">{r.year}</th>
                <td>{yen(r.expense.living)}</td>
                <td>{yen(r.expense.education)}</td>
                <td>{yen(r.expense.housing)}</td>
                <td>{yen(r.expense.funeral)}</td>
                <td>{yen(r.expense.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
