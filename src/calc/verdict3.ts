/**
 * 判定3値と世帯集約（再設計フェーズ1・タスク4）
 *
 * 規則の正本は `docs/redesign-spec-2026-09-21.md` §1。実在10世帯への当てはめの記録は
 * `docs/verdict3-derivation-2026-09-21.md`（2026-09-21 オーナーレビュー済み）。
 * **判定は導出値なので、正本の xlsx には書き込まない**（ADR-021）。
 *
 * この層は**金額を作らない**。すでに算定された必要額レンジと現保障を比べるだけの純粋関数。
 */

/** 個人の判定（3値）。`pending` は「現保障が分からないので判定しない」 */
export type Verdict3 = "reducible" | "uncertain" | "shortage" | "pending";

/** 世帯の判定（4値）。`rebalanceable` は**世帯レベル専用** */
export type HouseholdVerdict = Verdict3 | "rebalanceable";

/**
 * 個人の判定。
 *
 * **不等号は厳密。端ちょうどは両方とも『圏内・要精査』に入る。**
 * 上端ちょうどを「減らせる」にしないのは、**減額できる幅が0円だから**。
 * 「減らせます」と言いながら減らせる額が0円なのは空主張で、ナイフエッジで減額を誘うことになる。
 * 「言い切らない」「安全側に倒す」という §1 の原則に反する。
 */
export function verdict3(
  coverage: number | null | undefined,
  needLow: number,
  needHigh: number,
): Verdict3 {
  // 現保障が分からないなら過不足を断定しない（FR-14）
  if (coverage === null || coverage === undefined) return "pending";
  if (coverage > needHigh) return "reducible";
  if (coverage < needLow) return "shortage";
  return "uncertain";
}

/**
 * 世帯の判定。**個人の判定は書き換えない。**
 *
 * 集約が決めるのは「世帯としての言い方」だけで、
 * 「配偶者は200万必要・保障0」のような個人の事実は、世帯の見立てがどうであれ消さない。
 *
 * `rebalanceable`（組み替えの余地）＝ **保障の総量は足りているが、配分がずれている**。
 * 一方が過剰でもう一方が不足しているとき、合計の保険料を増やさずに整えられることを指す。
 */
export function aggregateHousehold(verdicts: Verdict3[]): HouseholdVerdict {
  // 判定していない人は数に入れない（分からないことを世帯の結論に混ぜない）
  const judged = verdicts.filter((v) => v !== "pending");
  if (judged.length === 0) return "pending";

  const hasShortage = judged.includes("shortage");
  const hasReducible = judged.includes("reducible");

  if (judged.every((v) => v === "reducible")) return "reducible";
  if (hasShortage && hasReducible) return "rebalanceable";
  if (hasShortage) return "shortage";
  return "uncertain";
}

/**
 * 貯蓄で受けられるかの判定（病気・けが・失業の行）。
 *
 * **死亡とは比較対象が違う。** 死亡は「保険の過不足」だが、こちらは「貯蓄という受け皿で足りるか」。
 * 内部の3値は同じものを使い、**画面のラベルだけ行ごとに出し分ける**
 * （`reducible`＝大丈夫のめやす／`uncertain`＝圏内・要精査／`shortage`＝備え不足の可能性）。
 *
 * **貯蓄もレンジで比べる。** 回答が「500〜1,000万円」の幅で来ているのに点推定と比べると、
 * 幅で計算するという原則（仕様 §4-4）と矛盾する。両側が幅なので、保守側に対称なルールにする：
 *
 * | 条件 | 判定 |
 * |---|---|
 * | `貯蓄の下端 > 必要額の上端` | 大丈夫のめやす |
 * | `貯蓄の上端 < 必要額の下端` | 備え不足の可能性 |
 * | それ以外（重なる） | 圏内・要精査 |
 *
 * **不等号は厳密。両端は圏内に入る。** 死亡側の境界裁定と同じ理由で、
 * ナイフエッジで「大丈夫」と言わない。
 */
export function verdictBySavings(
  savingsLow: number,
  savingsHigh: number,
  needLow: number,
  needHigh: number,
): Verdict3 {
  if (savingsLow > needHigh) return "reducible";
  if (savingsHigh < needLow) return "shortage";
  return "uncertain";
}
