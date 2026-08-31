/**
 * 年次キャッシュフロー（US-04b）
 *
 * **計算はすでに `projectDeath()` が全年分やっていた。それを1文しか出していなかった。**
 * 総額の引き算だけを見せると「なぜその金額か」「いつ苦しいか」が消える。FPの実務資料が
 * 例外なく40年分の表とグラフを主役に置いているのは、顧客が見たいのが総額ではなく
 * **自分の人生の並び**だからで、そこに合わせる（2026-08-31 の指摘）。
 *
 * 図は2枚に分ける：
 *   1. 収入・支出・年間収支（**すべて万円なので1軸で足りる**。FPキャプテンの年間収支グラフと同じ）
 *   2. 年末の貯蓄残高（尽きる年に印を付ける）
 *
 * 設計上の決めごと：
 * - **2軸グラフにしない**（`docs/デザイン方針.md` の禁止事項）。単位が同じものだけ重ねる
 * - 図には要約の `aria-label` を付け、**読み取れる値は本文と表にも必ず書く**
 * - 貯蓄残高の図でマイナスの年は Warning（オレンジ）。**赤は使わない** ── 赤字はシステムエラーではないし、
 *   煽らないための規定（不足は Warning）
 * - 描画ライブラリは足さない。主戦場が LINE 内ブラウザ（幅393px）
 */
import type { Projection, ProjectionRow } from "../../src/calc/projection.js";
import { formatMan } from "../../src/design/tokens.js";
import { bandWidth, ChartFrame, plotBottom, plotTop, xAt, yAt } from "./ChartFrame.js";
import { linearScale } from "./chartScale.js";
import s from "./page.module.css";

/** 目盛りラベルを間引く間隔。30年で全部出すと潰れる */
function labelEvery(count: number): number {
  if (count <= 12) return 2;
  if (count <= 25) return 5;
  return 10;
}

function childAges(row: ProjectionRow): string {
  return row.ages.children.length > 0 ? `${row.ages.children.join("・")}歳` : "—";
}

/** 折れ線の d 属性 */
function linePath(values: number[], scale: ReturnType<typeof linearScale>): string {
  const n = values.length;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i, n).toFixed(1)},${yAt(scale, v).toFixed(1)}`)
    .join(" ");
}

export function Cashflow({ pj, caption }: { pj: Projection; caption: string }) {
  const rows = pj.rows;
  if (rows.length < 2) return null;

  const n = rows.length;
  const years = rows.map((r) => r.year);
  const every = labelEvery(n);
  const first = rows[0];
  const last = rows[n - 1];
  const tightest = pj.tightest;

  // 図1：収入・支出・年間収支。すべて万円なので1軸に載る
  const flowScale = linearScale(
    Math.min(0, ...rows.map((r) => r.net)),
    Math.max(...rows.map((r) => Math.max(r.income.total, r.expense.total))),
  );
  const flowZero = yAt(flowScale, 0);
  const bw = bandWidth(n);

  // 図2：年末の貯蓄残高
  const balScale = linearScale(
    Math.min(0, ...rows.map((r) => r.balance)),
    Math.max(0, ...rows.map((r) => r.balance)),
  );
  const balZero = yAt(balScale, 0);
  const depletedIndex = pj.depletedAt ? rows.findIndex((r) => r.year === pj.depletedAt?.year) : -1;

  // ライフイベントのある年だけ拾う（起点は除く。全年に出すと読めない）
  const events = rows
    .map((r) => ({ year: r.year, what: r.events.filter((e) => e !== "診断の起点") }))
    .filter((e) => e.what.length > 0);

  return (
    <div className={s.cashflow}>
      <h3 className={s.h3}>
        これから{n}年間のお金の流れ（{caption}）
      </h3>

      <ChartFrame
        labelEvery={every}
        legend={[
          { label: "収入", color: "var(--chart-income-2)", line: true },
          { label: "支出", color: "var(--chart-expense-2)", line: true },
          { label: "年間収支", color: "var(--chart-income-4)" },
        ]}
        scale={flowScale}
        summary={`${first.year}年から${last.year}年までの、1年ごとの収入・支出・その差額。単位は万円。`}
        title="1年ごとの収入と支出（万円）"
        years={years}
      >
        {/* 年間収支の棒。0 の線から上下に伸ばす。
            **マイナスの年を別の色にしない** ── この図には支出の折れ線（オレンジ）が
            同居しているので、棒までオレンジにすると系列が混ざって読めなくなる。
            プラスかマイナスかは 0 の線に対する向きで伝わる。 */}
        {rows.map((r, i) => {
          const y = yAt(flowScale, r.net);
          return (
            <rect
              fill="var(--chart-income-4)"
              height={Math.max(1, Math.abs(y - flowZero))}
              key={r.year}
              width={bw}
              x={xAt(i, n) - bw / 2}
              y={Math.min(y, flowZero)}
            />
          );
        })}
        <path
          d={linePath(
            rows.map((r) => r.expense.total),
            flowScale,
          )}
          fill="none"
          stroke="var(--chart-expense-2)"
          strokeWidth="2"
        />
        <path
          d={linePath(
            rows.map((r) => r.income.total),
            flowScale,
          )}
          fill="none"
          stroke="var(--chart-income-2)"
          strokeWidth="2"
        />
      </ChartFrame>

      <ChartFrame
        labelEvery={every}
        legend={[
          { label: "年末に残っている貯蓄", color: "var(--chart-income-3)" },
          ...(depletedIndex >= 0
            ? [{ label: "貯蓄が尽きた年", color: "var(--color-warning)" }]
            : []),
        ]}
        scale={balScale}
        summary={
          pj.depletedAt
            ? `貯蓄の残高は${pj.depletedAt.year}年ごろに尽きる見込み。単位は万円。`
            : `貯蓄の残高は${last.year}年まで残る見込み。単位は万円。`
        }
        title="年末に残っている貯蓄（万円）"
        years={years}
      >
        {rows.map((r, i) => {
          const y = yAt(balScale, r.balance);
          return (
            <rect
              fill={r.balance < 0 ? "var(--color-warning)" : "var(--chart-income-3)"}
              height={Math.max(1, Math.abs(y - balZero))}
              key={r.year}
              width={bw}
              x={xAt(i, n) - bw / 2}
              y={Math.min(y, balZero)}
            />
          );
        })}
        {/* 尽きる年に印。FPの資料が吹き出しで指しているのと同じ役割 */}
        {depletedIndex >= 0 && (
          <g>
            <line
              stroke="var(--color-warning)"
              strokeDasharray="3 3"
              strokeWidth="1.5"
              x1={xAt(depletedIndex, n)}
              x2={xAt(depletedIndex, n)}
              y1={plotTop}
              y2={plotBottom}
            />
            <text
              fill="var(--color-warning-text)"
              fontSize="11"
              textAnchor={depletedIndex > n * 0.7 ? "end" : "start"}
              x={xAt(depletedIndex, n) + (depletedIndex > n * 0.7 ? -4 : 4)}
              y={plotTop + 11}
            >
              ここで尽きます
            </text>
          </g>
        )}
      </ChartFrame>

      {/* 図を読めなくても伝わるように、要点は文で書く */}
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
        <summary>年ごとの表を見る（{n}年分）</summary>
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
