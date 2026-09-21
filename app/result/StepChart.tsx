/**
 * 段差チャート（仕様 §5.3 STEP2・照合表 #6b）
 *
 * **移植元は `docs/design-mock/result.html` の `<svg width="660" height="252">`。**
 * 描画の文法（要素の種類・色・線幅・注記の置き方）はモックから動かさない：
 *
 * | 何 | 見た目 | 意味 |
 * |---|---|---|
 * | 実線 3.5px `#2E6B52` | 階段 | 公的年金（遺族年金）だけ |
 * | 破線 2px `#2E6B52` | 階段 | ＋遺されたご家族の就労収入 |
 * | 実線 3px `#9C4633` | 階段 | 生活費（前提で動く） |
 * | 塗り `rgba(156,70,51,0.15)` | 面 | 保険で埋める不足 |
 * | 黒丸＋番号 | 点 | 段差①②③ |
 * | 橙のブレース | 軸下 | 大学の学費がかかる時期 |
 *
 * **座標系だけ 390px 用に組み直す**（モックは1280px前提の 660×252）。
 * viewBox をそのまま使うと、文字が 5〜6px まで縮んで読めない。
 * `docs/design-mock/README.md` も 390px では組み直すよう指示している。
 *
 * **金額はここで作らない。** `projectDeath` が返した年次配列を描くだけ。
 */
import s from "./step2.module.css";

/** 1年ぶんの描画データ。月額（円）に直したものを受け取る */
export interface StepYear {
  year: number;
  survivorAge: number | null;
  childAges: number[];
  /** 公的年金の月額（遺族基礎＋遺族厚生＋中高齢寡婦加算） */
  pension: number;
  /** 遺されたご家族の就労収入の月額 */
  work: number;
  /** 生活費の月額 */
  living: number;
  /** 教育費の月額 */
  education: number;
  /** その年に大学期（18〜21歳）のお子さんがいるか。ブレースの範囲に使う */
  inUniversity: boolean;
  events: string[];
}

const W = 390;
const H = 232;
const PAD_L = 34;
const PAD_R = 8;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 150;

const MAN = 10_000;

/** 目盛りは10万円刻み。上端は「データの最大を含む10万円の倍数」まで */
function axisMax(rows: StepYear[]): number {
  const top = Math.max(...rows.map((r) => Math.max(r.living, r.pension + r.work)), 1);
  return Math.max(10, Math.ceil(top / MAN / 10) * 10) * MAN;
}

export function StepChart({
  rows,
  caption,
  survivorLabel,
  stepYears,
  depletedYear,
}: {
  rows: StepYear[];
  caption: string;
  /** 軸ラベルの年齢を誰のものとして書くか（「妻48歳」ではなく実データの呼び名） */
  survivorLabel: string;
  /**
   * 番号を打つ年（西暦）。**呼び出し側が決めた並びをそのまま使う。**
   * ここで独自に拾い直すと、下の説明カードの①②③と番号がずれる（2026-09-21 に実際にずれた）。
   */
  stepYears: number[];
  /**
   * **貯蓄が尽きる年**（西暦）。尽きない世帯では null。
   *
   * 旧「検査値パネル」（`Vitals`）が数字のタイルで出していた項目の移し先。
   * 数字1つで「2041年ごろ」と出すより、**いつ起きるかを時間軸の上で指す**ほうが、
   * この事実の性質（時点の話である）に合う。
   *
   * **尽きない世帯では出さない。** `decisionPoints` の「全世帯同文禁止」と同じ理由で、
   * 起きない事実の目印を全世帯に出すと、隣の世帯で嘘になる。
   */
  depletedYear: number | null;
}) {
  if (rows.length < 2) return null;

  const max = axisMax(rows);
  const n = rows.length - 1;
  const x = (i: number) => PAD_L + (i / n) * (W - PAD_L - PAD_R);
  const y = (v: number) => PLOT_BOTTOM - (v / max) * (PLOT_BOTTOM - PLOT_TOP);

  /** 階段（その年の値がその年いっぱい続く）を1本の path にする */
  const stair = (pick: (r: StepYear) => number) => {
    let d = `M ${x(0)} ${y(pick(rows[0]))}`;
    for (let i = 1; i < rows.length; i++) {
      d += ` H ${x(i)} V ${y(pick(rows[i]))}`;
    }
    return d;
  };

  const pension = (r: StepYear) => r.pension;
  const withWork = (r: StepYear) => r.pension + r.work;
  const living = (r: StepYear) => r.living;

  // 不足の塗り：生活費の階段まで行って、公的年金の階段を逆に辿って閉じる
  const shortfall = (() => {
    let d = stair(living);
    for (let i = rows.length - 1; i >= 0; i--) {
      d +=
        i === rows.length - 1 ? ` L ${x(i)} ${y(pension(rows[i]))}` : ` V ${y(pension(rows[i]))}`;
      if (i > 0) d += ` H ${x(i - 1)}`;
    }
    return `${d} Z`;
  })();

  // 番号を打つ年は呼び出し側が決める（説明カードと同じ並びを使う）
  const steps = stepYears
    .map((y) => rows.find((r) => r.year === y))
    .filter((r): r is StepYear => r !== undefined);

  /**
   * **大学の学費がかかる時期**を指す。
   *
   * 2026-09-21、「教育費 > 0 の年」で引いていたため、幼稚園から大学までの
   * ほぼ全期間（2026〜2042）が帯になり、**帯が何も指していなかった**。
   * この帯の役目は、**最大の崖と大学費が重なる山場**を指すこと。
   */
  const uni = rows.filter((r) => r.inUniversity);
  const eduFrom = uni.length > 0 ? rows.indexOf(uni[0]) : -1;
  const eduTo = uni.length > 0 ? rows.indexOf(uni[uni.length - 1]) : -1;

  // 不足がいちばん厚い年を帯で強調する（モックの「不足が最大」）
  const worst = rows.reduce((a, b) => (b.living - b.pension > a.living - a.pension ? b : a));
  const worstIndex = rows.indexOf(worst);

  const ticks = [];
  for (let v = MAN * 10; v <= max; v += MAN * 10) ticks.push(v);

  const labelAt = [0, Math.round(n / 2), n];

  return (
    <figure className={s.chartWrap}>
      <figcaption className={s.chartTitle}>
        公的な収入は、階段のように減っていきます — いつ・なぜ、が下の1〜3です
      </figcaption>

      <div className={s.legend}>
        <span>
          <i className={s.lgPension} />
          公的年金（遺族年金）
        </span>
        <span>
          <i className={s.lgWork} />＋{survivorLabel}の収入
        </span>
        <span>
          <i className={s.lgLiving} />
          生活費
        </span>
        <span>
          <i className={s.lgGap} />
          保険で埋める不足
        </span>
      </div>

      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption}>
        <title>{caption}</title>

        {ticks.map((v) => (
          <g key={v}>
            <line className={s.grid} x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} />
            <text className={s.axisText} x={PAD_L - 5} y={y(v) + 3} textAnchor="end">
              {v / MAN}万
            </text>
          </g>
        ))}

        {/* 不足がいちばん厚い年を帯で示す（モックの「不足が最大」） */}
        <rect
          className={s.worstBand}
          x={x(Math.max(0, worstIndex - 0.5))}
          y={PLOT_TOP}
          width={Math.max(6, x(1) - x(0))}
          height={PLOT_BOTTOM - PLOT_TOP}
        />
        <text className={s.worstLabel} x={x(worstIndex)} y={PLOT_TOP - 5} textAnchor="middle">
          不足が最大
        </text>

        {steps.map((r) => (
          <line
            className={s.stepLine}
            key={`v${r.year}`}
            x1={x(rows.indexOf(r))}
            x2={x(rows.indexOf(r))}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
          />
        ))}

        <path className={s.gap} d={shortfall} />
        <path className={s.living} d={stair(living)} />
        <path className={s.work} d={stair(withWork)} />
        <path className={s.pension} d={stair(pension)} />

        <line className={s.axis} x1={PAD_L} x2={W - PAD_R} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} />

        {labelAt.map((i, k) => (
          <g key={rows[i].year}>
            <text
              className={s.axisText}
              x={x(i)}
              y={PLOT_BOTTOM + 15}
              textAnchor={k === 0 ? "start" : k === labelAt.length - 1 ? "end" : "middle"}
            >
              {rows[i].year}年
            </text>
            {rows[i].survivorAge !== null && (
              <text
                className={s.axisSub}
                x={x(i)}
                y={PLOT_BOTTOM + 27}
                textAnchor={k === 0 ? "start" : k === labelAt.length - 1 ? "end" : "middle"}
              >
                {survivorLabel}
                {rows[i].survivorAge}歳
              </text>
            )}
          </g>
        ))}

        {steps.map((r, i) => (
          <g key={`n${r.year}`}>
            <circle className={s.stepDot} cx={x(rows.indexOf(r))} cy={y(pension(r))} r="8" />
            <text
              className={s.stepNum}
              x={x(rows.indexOf(r))}
              y={y(pension(r)) + 3}
              textAnchor="middle"
            >
              {i + 1}
            </text>
          </g>
        ))}

        {/*
          **貯蓄が尽きる年**を縦マーカーで指す（2026-09-21・`Vitals` からの移設）。
          段差①②③と同じ語彙（西暦＋年齢）で書き、**段差とは別の見た目**にする
          ── 段差は「公的収入が減った」、これは「受け皿が無くなった」で、種類が違う。
        */}
        {depletedYear !== null &&
          (() => {
            const i = rows.findIndex((r) => r.year === depletedYear);
            if (i < 0) return null;
            const age = rows[i].survivorAge;
            return (
              <g>
                <line
                  className={s.depletedLine}
                  x1={x(i)}
                  x2={x(i)}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                />
                <text
                  className={s.depletedLabel}
                  x={x(i)}
                  y={PLOT_BOTTOM - 4}
                  textAnchor={i > rows.length / 2 ? "end" : "start"}
                  dx={i > rows.length / 2 ? -4 : 4}
                >
                  {depletedYear}年{age !== null ? `（${survivorLabel}${age}歳）` : ""}・貯蓄が尽きる
                </text>
              </g>
            );
          })()}

        {/* 大学の学費がかかる時期を軸下のブレースで示す */}
        {eduFrom >= 0 && eduTo > eduFrom && (
          <g>
            <path
              className={s.brace}
              d={`M ${x(eduFrom)} ${PLOT_BOTTOM + 34} V ${PLOT_BOTTOM + 39} H ${x(eduTo)} V ${PLOT_BOTTOM + 34}`}
            />
            <text
              className={s.braceText}
              x={(x(eduFrom) + x(eduTo)) / 2}
              y={PLOT_BOTTOM + 53}
              textAnchor="middle"
            >
              大学の学費がかかる時期（{rows[eduFrom].year}〜{rows[eduTo].year}）
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}
