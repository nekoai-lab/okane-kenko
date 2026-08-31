/**
 * 年次キャッシュフロー（US-04b）
 *
 * **計算はすでに `projectDeath()` が全年分やっていた。それを1文しか出していなかった。**
 * 総額の引き算だけを見せると「なぜその金額か」「いつ苦しいか」が消える。FPの実務資料が
 * 例外なく40年分の表とグラフを主役に置いているのは、顧客が見たいのが総額ではなく
 * **自分の人生の並び**だからで、そこに合わせる（2026-08-31 の指摘）。
 *
 * 設計上の決めごと：
 * - **2軸グラフにしない**（`docs/デザイン方針.md` の禁止事項）。残高と年間収支は縦に並べる
 * - 棒は装飾（`aria-hidden`）。**読み取れる値はすべて文字で併記**し、
 *   全年の数字は下の表（`<details>`）に置く。色だけ・形だけで意味を伝えない
 * - 残高がマイナスの年は Warning（オレンジ）。**赤は使わない** ── 赤字はシステムエラーではないし、
 *   煽らないための規定（不足は Warning）
 * - 描画ライブラリは足さない。主戦場が LINE 内ブラウザ（幅393px）で、
 *   このためだけに入れると初回読み込みが重くなる
 */
import type { Projection, ProjectionRow } from "../../src/calc/projection.js";
import { formatMan } from "../../src/design/tokens.js";
import s from "./page.module.css";

/** 目盛りラベルを間引く間隔。30年で全部出すと幅393pxでは潰れる */
function labelEvery(count: number): number {
  if (count <= 12) return 2;
  if (count <= 25) return 5;
  return 10;
}

function childAges(row: ProjectionRow): string {
  return row.ages.children.length > 0 ? `${row.ages.children.join("・")}歳` : "—";
}

export function Cashflow({ pj, caption }: { pj: Projection; caption: string }) {
  const rows = pj.rows;
  if (rows.length < 2) return null;

  // 縮尺は「残高の絶対値の最大」。プラス側とマイナス側で高さを分け合い、0の線を揃える。
  const maxPos = Math.max(0, ...rows.map((r) => r.balance));
  const maxNeg = Math.max(0, ...rows.map((r) => -r.balance));
  const span = maxPos + maxNeg;
  if (span <= 0) return null;
  const posShare = (maxPos / span) * 100;

  const every = labelEvery(rows.length);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const tightest = pj.tightest;

  // ライフイベントのある年だけ拾う（起点は除く。全年に出すと読めない）
  const events = rows
    .map((r) => ({ year: r.year, what: r.events.filter((e) => e !== "診断の起点") }))
    .filter((e) => e.what.length > 0);

  return (
    <div className={s.cashflow}>
      <div className={s.subhead}>
        これから{rows.length}年間のお金の流れ（{caption}）
      </div>

      {/* 貯蓄残高の推移。棒は装飾で、値は下の文と表が正 */}
      <div aria-hidden="true" className={s.cfChart}>
        <div className={s.cfPos} style={{ height: `${posShare}%` }}>
          {rows.map((r) => (
            <div className={s.cfCol} key={`p-${r.year}`}>
              <div
                className={s.cfBarPos}
                style={{
                  height: r.balance > 0 ? `${(r.balance / span / (posShare / 100)) * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <div className={s.cfZero} />
        <div className={s.cfNeg} style={{ height: `${100 - posShare}%` }}>
          {rows.map((r) => (
            <div className={s.cfCol} key={`n-${r.year}`}>
              <div
                className={s.cfBarNeg}
                style={{
                  height:
                    r.balance < 0 && posShare < 100
                      ? `${(-r.balance / span / (1 - posShare / 100)) * 100}%`
                      : "0%",
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className={s.cfAxis}>
        {rows.map((r, i) => (
          <div className={s.cfTick} key={`t-${r.year}`}>
            {i % every === 0 ? r.year - 2000 : ""}
          </div>
        ))}
      </div>
      <p className={s.cfCaption}>
        縦棒は<strong>その年の年末に残っている貯蓄</strong>（横軸は西暦の下2桁）。
        {maxNeg > 0 ? "オレンジは、貯蓄が尽きてマイナスになる年です。" : ""}
      </p>

      {/* 棒を読めなくても伝わるように、要点は文で書く */}
      <ul className={s.cfPoints}>
        <li>
          はじめ（{first.year}年）の貯蓄は <strong>約{formatMan(first.balance)}</strong>
        </li>
        {tightest ? (
          <li>
            いちばん細いのは <strong>{tightest.year}年</strong>ごろ（お子さん{childAges(tightest)}／
            その年の収支は{tightest.net >= 0 ? "約" : "▲約"}
            {formatMan(Math.abs(tightest.net))}）
          </li>
        ) : null}
        <li>
          {pj.depletedAt ? (
            <>
              この前提のままだと <strong>{pj.depletedAt.year}年ごろに貯蓄が底をつく</strong>見込み
            </>
          ) : (
            <>
              最後（{last.year}年）まで貯蓄は残る見込み（約{formatMan(Math.max(0, last.balance))}）
            </>
          )}
        </li>
      </ul>

      {events.length > 0 && (
        <p className={s.cfEvents}>
          この間に起きること：
          {events.map((e) => `${e.year}年 ${e.what.join("・")}`).join(" ／ ")}
        </p>
      )}

      {/* 全年の数字。グラフを読まなくても、ここに同じ内容がある */}
      <details className={s.criteria}>
        <summary>年ごとの表を見る（{rows.length}年分）</summary>
        <div className={s.cfTableWrap}>
          <table className={s.cfTable}>
            <caption className={s.basis}>
              単位は万円。金額は概算で、四捨五入のため内訳の合計と一致しないことがあります。
            </caption>
            <thead>
              <tr>
                <th scope="col">西暦</th>
                <th scope="col">お子さん</th>
                <th scope="col">収入</th>
                <th scope="col">支出</th>
                <th scope="col">年間収支</th>
                <th scope="col">年末の貯蓄</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr className={r.balance < 0 ? s.cfRowNeg : undefined} key={r.year}>
                  <th scope="row">{r.year}</th>
                  <td>{childAges(r)}</td>
                  <td>{formatMan(r.income.total)}</td>
                  <td>{formatMan(r.expense.total)}</td>
                  <td>
                    {r.net < 0 ? "▲" : ""}
                    {formatMan(Math.abs(r.net))}
                  </td>
                  <td>
                    {r.balance < 0 ? "▲" : ""}
                    {formatMan(Math.abs(r.balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
