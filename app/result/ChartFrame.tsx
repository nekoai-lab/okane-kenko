/**
 * グラフの枠（縦軸・目盛り・グリッド・横軸・凡例）
 *
 * 棒を並べるだけでは図表にならない。**丸い目盛りの縦軸があって初めて金額として読める。**
 * FPの実務資料が例外なく持っているのは、目盛り・グリッド・凡例・単位の4つ。
 *
 * 設計上の決めごと：
 * - SVG を viewBox で伸縮させる。幅393px（LINE内ブラウザ）と720px（読み物幅）の
 *   どちらでも文字が読める大きさになるよう、viewBox の座標系を480×240にしてある
 * - **色は必ずトークン経由**（`--chart-*`）。プリミティブを直接書かない
 * - 図には `role="img"` と要約の `aria-label` を付ける。**細かい値は必ず本文か表に併記**し、
 *   図が読めなくても情報が落ちないようにする
 * - **目盛りに単位を繰り返さない。** 「1,000万円」を毎行書くと軸が太って本体が痩せるうえ、
 *   左端で見切れる。単位は図の見出しに1回だけ置き、目盛りは数字にする（FPの資料も同じ）
 * - 描画ライブラリは足さない
 */
import type { ReactNode } from "react";
import type { Scale } from "./chartScale.js";
import s from "./page.module.css";

/** 図の座標系。すべてのグラフで共通にして、並べたとき目盛りの位置がそろうようにする */
export const PLOT = {
  w: 480,
  h: 240,
  // 左は目盛りラベルの幅。「▲2,000」まで見切れずに入る幅にしてある
  left: 52,
  right: 10,
  top: 12,
  bottom: 28,
} as const;

export const plotLeft = PLOT.left;
export const plotRight = PLOT.w - PLOT.right;
export const plotTop = PLOT.top;
export const plotBottom = PLOT.h - PLOT.bottom;
export const plotWidth = plotRight - plotLeft;
export const plotHeight = plotBottom - plotTop;

/** i 番目（0始まり・全 n 個）の点の x。棒の中心にそろえる */
export function xAt(i: number, n: number): number {
  if (n <= 1) return plotLeft + plotWidth / 2;
  const band = plotWidth / n;
  return plotLeft + band * (i + 0.5);
}

/** 棒1本の幅（隙間を空けて、隣と混ざって見えないようにする） */
export function bandWidth(n: number): number {
  return Math.max(1, (plotWidth / Math.max(1, n)) * 0.72);
}

/** 値 → y 座標 */
export function yAt(scale: Scale, v: number): number {
  return plotBottom - scale.pos(v) * plotHeight;
}

/** 目盛りのラベル。万円の数字だけを出し、マイナスは ▲ で示す（会計の慣習） */
function tickLabel(yen: number): string {
  const man = Math.round(yen / 10_000);
  return `${man < 0 ? "▲" : ""}${Math.abs(man).toLocaleString("ja-JP")}`;
}

export interface LegendItem {
  label: string;
  color: string;
  /** 線で示す系列は true（凡例の印を線にする） */
  line?: boolean;
}

export function ChartFrame({
  scale,
  years,
  labelEvery,
  title,
  summary,
  legend,
  children,
}: {
  scale: Scale;
  years: number[];
  labelEvery: number;
  /** 図の上に出す見出し（本文にも同じことが書いてある前提） */
  title: string;
  /** 読み上げ用の要約。図が見えない人にも結論が伝わるようにする */
  summary: string;
  legend: LegendItem[];
  children: ReactNode;
}) {
  const n = years.length;
  const zeroInside = scale.lo < 0 && scale.hi > 0;

  return (
    <figure className={s.chartFigure}>
      <figcaption className={s.chartTitle}>{title}</figcaption>
      <svg
        aria-label={summary}
        className={s.chartSvg}
        role="img"
        viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
      >
        {/* 目盛りとグリッド */}
        {scale.ticks.map((t) => {
          const y = yAt(scale, t);
          return (
            <g key={t}>
              <line
                stroke="var(--chart-grid)"
                strokeWidth={t === 0 && zeroInside ? 1.5 : 1}
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
              />
              <text
                fill="var(--chart-axis-text)"
                fontSize="11"
                textAnchor="end"
                x={plotLeft - 6}
                y={y + 4}
              >
                {tickLabel(t)}
              </text>
            </g>
          );
        })}

        {/* 系列（棒・線・面） */}
        {children}

        {/* 横軸 */}
        <line
          stroke="var(--color-border)"
          strokeWidth="1"
          x1={plotLeft}
          x2={plotRight}
          y1={plotBottom}
          y2={plotBottom}
        />
        {years.map((y, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              fill="var(--chart-axis-text)"
              fontSize="11"
              key={y}
              textAnchor="middle"
              x={xAt(i, n)}
              y={plotBottom + 16}
            >
              {y}
            </text>
          ) : null,
        )}
      </svg>

      <ul className={s.chartLegend}>
        {legend.map((it) => (
          <li className={s.chartLegendItem} key={it.label}>
            <span
              aria-hidden="true"
              className={it.line ? s.chartLegendLine : s.chartLegendChip}
              style={{ background: it.color }}
            />
            {it.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
