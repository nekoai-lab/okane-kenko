/**
 * 世帯単位の診断（ADR-007）
 *
 * 本人・配偶者の両方の死亡ケースを算定し、世帯としての結論を1つに畳む。
 * 配偶者の保険が未入力でも診断は完走する（段階的に返す・FR-14 / ADR-007b）。
 */
import type { ParamSet } from "../params/index.js";
import { assertUsable } from "../params/index.js";
import { calcDeath } from "./death.js";
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
}

export function diagnose(
  p: ParamSet,
  input: DiagnoseInput,
  asOf: Date = new Date(),
): HouseholdDiagnosis {
  // 期限切れの中核パラメータでは診断しない（PR-04）。古い値で黙って出さない。
  assertUsable(p, asOf);

  const base = {
    children: input.children,
    housing: input.housing,
    assets: input.assets,
    monthlyLiving: input.monthlyLiving,
    educationPlan: input.educationPlan,
  };

  const self = calcDeath(p, {
    ...base,
    deceased: input.self,
    survivor: input.spouse,
    currentCoverage: input.coverageSelf,
  });

  let spouse: DeathResult | null = null;
  if (input.spouse && input.coverageSpouse !== undefined) {
    spouse = calcDeath(p, {
      ...base,
      deceased: input.spouse,
      survivor: input.self,
      currentCoverage: input.coverageSpouse,
    });
  }

  const medical = calcMedical(
    p,
    Math.max(input.self.income, input.spouse?.income ?? 0),
    input.assets,
  );

  const hasChild = input.children.length > 0;
  const reform2028 = hasChild
    ? {
        applicable: false,
        reason:
          "遺族厚生年金の5年有期化（2028年4月〜）は子のいない配偶者が対象です。お子さんがいるこの世帯は当面これまで通りで、直撃しません。",
      }
    : {
        applicable: true,
        reason:
          "遺族厚生年金の5年有期化（2028年4月〜）は、子のいない配偶者が対象です。この世帯は該当します。",
      };

  // 介護の目安（別レイヤー）。点の必要額には入れず、「備えるなら」の参考額として返す。
  // 配偶者がいる世帯だけ（遺されて介護を要する側がいる場合）に出す。分散が大きい旨は表示側で明示する。
  const care = p.elderly.care;
  const elderlyCareEstimate = input.spouse ? care.oneTime + care.monthly * care.months : 0;

  return {
    paramVersion: p.version,
    self,
    spouse,
    medical,
    reform2028,
    elderlyCareEstimate,
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
