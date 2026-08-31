/**
 * 必要保障額の推移（US-04d）
 *
 * **必要保障額は「今日の1点」ではなく、時間とともに減っていく線である。**
 * 子が育ち、教育費が終わり、残りの期間が短くなるほど必要な額は下がる。
 * 点で出すと「いま多すぎる／足りない」までしか言えないが、線にすると
 * **「いつまで、いくら必要か」**が同時に伝わる。FPの実務資料が必ずこの形を持っているのは、
 * 顧客の関心が金額そのものではなく「いつまで続く話なのか」にあるため（2026-08-31）。
 *
 * 設計上の決めごと：
 * - 面（必要額）と横線（いまの保障）は**同じ縦軸**。2軸にはしない（デザイン方針の禁止事項）
 * - **交差する年（いまの保障で足りるようになる年）に印を付ける。** ここがこの図の要点
 * - 「足りるようになる年」を言い切らず「見込み」と書く。前提が変われば動く数字なので
 * - 保険がいつまで続くか（定期／終身）は**まだ聞いていない**ので、いまの保障は
 *   水平線で描く。実際には定期が切れると階段状に下がる。ここは入力を増やす判断が要る
 */
import type { CoveragePoint } from "../../src/calc/projection.js";
import { formatMan } from "../../src/design/tokens.js";
import { ChartFrame, plotBottom, plotTop, xAt, yAt } from "./ChartFrame.js";
import { linearScale } from "./chartScale.js";
import s from "./page.module.css";

export function CoverageCurve({
  points,
  coverage,
}: {
  points: CoveragePoint[];
  /** いまの死亡保障額。分からない（未入力）なら null */
  coverage: number | null;
}) {
  if (points.length < 2) return null;

  const maxNeed = Math.max(...points.map((p) => p.need));

  // **必要額がずっと0の世帯にグラフを出さない。**
  // 棒が1本も立たない絵は、情報がないどころか「壊れている」と読まれる。
  // ここは良い知らせなので、絵ではなく言葉で言い切る（「良い知らせは良い知らせとして届ける」）。
  if (maxNeed <= 0) {
    return (
      <div className={s.reduce}>
        <strong>いまの前提では、この先ずっと上乗せの保障は必要ありません。</strong>{" "}
        公的な支えとご自身の収入・資産で、支出をまかなえる見込みだからです。
        <p className={s.basis}>
          ※ 万一の直後に要る当座のお金（葬儀・予備費）は、上の「目安」に出しています。
          ご存命のあいだの貯蓄の増減は見ていません。
        </p>
      </div>
    );
  }

  const n = points.length;
  const years = points.map((p) => p.year);
  const every = n > 25 ? 10 : 5;
  const scale = linearScale(0, Math.max(maxNeed, coverage ?? 0));

  // いまの保障が必要額に追いつく最初の年（＝それ以降は上乗せが要らなくなる見込み）
  const crossingIndex = coverage === null ? -1 : points.findIndex((p) => p.need <= coverage);
  const crossing = crossingIndex >= 0 ? points[crossingIndex] : null;

  // 必要額の面。下端（0の線）で閉じる
  const area = `M${xAt(0, n).toFixed(1)},${yAt(scale, 0).toFixed(1)} ${points
    .map((p, i) => `L${xAt(i, n).toFixed(1)},${yAt(scale, p.need).toFixed(1)}`)
    .join(" ")} L${xAt(n - 1, n).toFixed(1)},${yAt(scale, 0).toFixed(1)} Z`;

  return (
    <div className={s.cashflow}>
      <h3 className={s.h3}>必要な保障は、これから減っていきます</h3>

      <ChartFrame
        labelEvery={every}
        legend={[
          { label: "そこから先に必要な保障", color: "var(--chart-expense-3)" },
          ...(coverage !== null
            ? [
                {
                  label: `いまの保障 約${formatMan(coverage)}`,
                  color: "var(--color-accent)",
                  line: true,
                },
              ]
            : []),
        ]}
        scale={scale}
        summary={
          crossing
            ? `必要な保障は年々下がり、${crossing.year}年ごろにいまの保障で足りるようになる見込み。単位は万円。`
            : `必要な保障は年々下がる見込み。単位は万円。`
        }
        title="その年に万一があったとき、そこから先に必要な保障（万円）"
        years={years}
      >
        <path d={area} fill="var(--chart-expense-3)" fillOpacity="0.85" />

        {coverage !== null && (
          <line
            stroke="var(--color-accent)"
            strokeWidth="2"
            x1={xAt(0, n)}
            x2={xAt(n - 1, n)}
            y1={yAt(scale, coverage)}
            y2={yAt(scale, coverage)}
          />
        )}

        {/* 交差する年に印。この図でいちばん言いたいことなので、図の中でも指す */}
        {crossing && crossingIndex > 0 && (
          <g>
            <line
              stroke="var(--color-success)"
              strokeDasharray="3 3"
              strokeWidth="1.5"
              x1={xAt(crossingIndex, n)}
              x2={xAt(crossingIndex, n)}
              y1={plotTop}
              y2={plotBottom}
            />
            <text
              fill="var(--color-success-text)"
              fontSize="11"
              textAnchor={crossingIndex > n * 0.7 ? "end" : "start"}
              x={xAt(crossingIndex, n) + (crossingIndex > n * 0.7 ? -4 : 4)}
              y={plotTop + 11}
            >
              ここで足りるようになります
            </text>
          </g>
        )}
      </ChartFrame>

      <ul className={s.cfPoints}>
        <li>
          いま必要なのは <strong>約{formatMan(points[0].need)}</strong>
          {points[0].survivorAge !== null ? `（配偶者${points[0].survivorAge}歳の時点）` : ""}
        </li>
        {/* 「下がる」と決め打ちしない。年によっては必要額が上がることもあり得るので、
            実際の値を比べてから書く（事実と違う言い方をしない） */}
        <li>
          {(() => {
            const i = n > 10 ? 10 : n - 1;
            const label = i === 10 ? "10年後" : `最後（${points[i].year}年）`;
            const dir =
              points[i].need < points[0].need
                ? "まで下がる見込み"
                : points[i].need > points[0].need
                  ? "になる見込み"
                  : "で変わらない見込み";
            return (
              <>
                {label}には <strong>約{formatMan(points[i].need)}</strong> {dir}
              </>
            );
          })()}
        </li>
        {coverage !== null && crossing ? (
          crossingIndex === 0 ? (
            <li>
              <strong>いまの保障は、すでに必要額を上回っています</strong>
              （いまの前提では、上乗せは要りません）
            </li>
          ) : (
            <li>
              いまの保障で足りるようになるのは <strong>{crossing.year}年ごろ</strong>
              から（いまの前提では）
            </li>
          )
        ) : null}
        {coverage !== null && !crossing ? (
          <li>いまの前提では、この期間を通じて必要額がいまの保障を上回っています</li>
        ) : null}
      </ul>

      <p className={s.basis}>
        ※ ご存命のあいだの貯蓄の増減は見ていません（金融資産は今の額のまま置いています）。
        実際に貯蓄が増えれば、必要な額はこの線よりさらに下がります。
        {coverage !== null
          ? "いまの保障は、保険がいつまで続くかを伺っていないため、水平の線で描いています。"
          : ""}
      </p>
    </div>
  );
}
