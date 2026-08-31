/**
 * グラフの目盛り計算（純関数）
 *
 * 軸も目盛りも無い棒の羅列は、読み手には「絵」であって図表ではない。
 * 縦軸に丸い数字の目盛りを置くと、初めて金額として読める。
 *
 * ここを純関数にしてあるのは、目盛りの丸め方が汚いと図全体が素人くさく見えるのに、
 * 目で見て気づきにくいため（テストで固定する）。
 */

/** 1・2・5・10 のいずれか × 10^n に丸める（人が読みやすい刻み幅） */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const frac = raw / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * base;
}

export interface Scale {
  /** 目盛りの値（円）。小さい順 */
  ticks: number[];
  /** 軸の下端・上端（円）。目盛りに合わせて外側に丸めてある */
  lo: number;
  hi: number;
  /** 値 → 0（下端）〜1（上端）の位置 */
  pos(v: number): number;
}

/**
 * 丸い目盛りを持つ縦軸を作る。
 * `target` は目盛りの本数の目安（きっちりこの数にはならない）。
 */
export function linearScale(min: number, max: number, target = 4): Scale {
  const lowest = Math.min(min, max);
  const highest = Math.max(min, max);
  // 幅が0（全部同じ値）でも軸が潰れないように、最低限の幅を作る
  const span = highest - lowest || Math.abs(highest) || 1;
  const step = niceStep(span / Math.max(1, target));
  const lo = Math.floor(lowest / step) * step;
  const hi = Math.ceil(highest / step) * step;
  const ticks: number[] = [];
  // 浮動小数の誤差で最後の目盛りが落ちないよう、半歩だけ余裕を見る
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  const range = hi - lo || 1;
  return { ticks, lo, hi, pos: (v: number) => (v - lo) / range };
}
