/**
 * 世帯単位の診断（ADR-007）
 *
 * 本人・配偶者の両方の死亡ケースを算定し、世帯としての結論を1つに畳む。
 * 配偶者の保険が未入力でも診断は完走する（段階的に返す・FR-14 / ADR-007b）。
 */
import type { ParamSet } from "../params/index.js";
import { assertUsable } from "../params/index.js";
import { jstYear } from "../time/jstYear.js";
import { calcDeath } from "./death.js";
import { reform2028 as judgeReform2028 } from "./reform2028.js";
import { calcMedical } from "./medical.js";
import type {
  DeathResult,
  Household,
  HouseholdDiagnosis,
  HouseholdHeadline,
  Person,
} from "./types.js";

export { calcDeath } from "./death.js";
export { calcMedical, kogakuCap } from "./medical.js";
export * from "./types.js";

export interface DiagnoseInput {
  self: Person;
  spouse: Person | null;
  children: number[];
  housing: Household["housing"];
  assets: number;
  monthlyLiving: number;
  educationPlan: Household["educationPlan"];
  /** 本人を被保険者とする保障額（円）。不明なら null */
  coverageSelf: number | null;
  /** 配偶者を被保険者とする保障額（円）。未入力なら undefined = まだ聞いていない */
  coverageSpouse?: number | null;
  /**
   * 暮らし方の目盛り（D-02・ADR-022）。省略時は 1.0 で出力は一切変わらない。
   * **率（0.70 / 0.50）とは別の変数**。率は人数、これは暮らし方の選好。
   */
  lifestyleDial?: number;
}

/**
 * `DiagnoseInput` から `Household` を作る。**画面が手で組み立てない**ための入口。
 *
 * 2026-09-21、結果画面が `projectDeath` に渡す `Household` を手で組んでおり、
 * **暮らし方の目盛り（`lifestyleDial`）を1つ落としていた**。
 * その結果、必要額だけが動いて年次（台帳・段差チャート）は古いまま残った
 * ── #4 で最も起きやすい「部分更新の取り残し」そのもの。
 *
 * テストでは画面の手組みを見られないので、**構造で塞ぐ**。
 * 入力に項目が増えても、ここを通していれば落ちない。
 */
export function toHousehold(
  input: DiagnoseInput,
  who: "self" | "spouse",
): Household {
  const deceased = who === "self" ? input.self : input.spouse;
  if (!deceased) throw new Error("配偶者がいない世帯で配偶者の死亡ケースは作れない");
  return {
    children: input.children,
    housing: input.housing,
    assets: input.assets,
    monthlyLiving: input.monthlyLiving,
    educationPlan: input.educationPlan,
    lifestyleDial: input.lifestyleDial,
    deceased,
    survivor: who === "self" ? input.spouse : input.self,
    currentCoverage: who === "self" ? input.coverageSelf : (input.coverageSpouse ?? null),
  };
}

export function diagnose(
  p: ParamSet,
  input: DiagnoseInput,
  asOf: Date = new Date(),
): HouseholdDiagnosis {
  // 期限切れの中核パラメータでは診断しない（PR-04）。古い値で黙って出さない。
  assertUsable(p, asOf);

  const self = calcDeath(p, toHousehold(input, "self"));

  let spouse: DeathResult | null = null;
  if (input.spouse && input.coverageSpouse !== undefined) {
    // 配偶者が亡くなるケースで遺されるのは**本人**
    spouse = calcDeath(p, { ...toHousehold(input, "spouse"), survivorLabel: "あなた" });
  }

  const medical = calcMedical(
    p,
    Math.max(input.self.income, input.spouse?.income ?? 0),
    input.assets,
  );

  /**
   * 2028年改正の該当判定。**子の有無ではなく配偶者の生年コホートで決まる**（`reform2028.ts`）。
   * 子がいることは末子が18歳になるまでの猶予にしかならない。
   */
  const reform2028 = judgeReform2028({
    survivorAge: input.spouse?.age ?? null,
    asOfYear: jstYear(asOf),
    hasChildren: input.children.length > 0,
  });

  return {
    paramVersion: p.version,
    self,
    spouse,
    medical,
    reform2028,
    householdHeadline: headline(self, spouse),
  };
}

/**
 * 世帯としての結論を1つに畳む（FR-25）。
 * 片方が過剰・片方が不足なら "rebalanceable"。
 * ADR-007c：「合計保険料を増やさずに解決できます」までは言うが、
 *           「付け替えましょう」「解約して入り直しましょう」とは言わない。
 */
export function headline(self: DeathResult, spouse: DeathResult | null): HouseholdHeadline {
  const results = [self, spouse].filter((r): r is DeathResult => r !== null);
  const totalExcess = results
    .filter((r) => r.gap.kind === "excess")
    .reduce((s, r) => s + r.gap.amount, 0);
  const totalShortage = results
    .filter((r) => r.gap.kind === "shortage")
    .reduce((s, r) => s + r.gap.amount, 0);

  let kind: HouseholdHeadline["kind"];
  if (totalExcess > 0 && totalShortage > 0) kind = "rebalanceable";
  else if (totalShortage > 0) kind = "shortage";
  else if (totalExcess > 0) kind = "reducible";
  else kind = "all_covered";

  return { kind, totalExcess, totalShortage };
}
