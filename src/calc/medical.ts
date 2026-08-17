/**
 * 医療保障の過不足判定（機能仕様書 §4.3 / ADR-010）
 *
 * 入院期間は公的統計（患者調査 平均在院日数）に差し替えること。
 * 資産倍率だけは公的な裏付けがないため「当社基準」として明示して表示する。
 */
import type { ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import type { MedicalResult, MedicalVerdict } from "./types.js";

export function kogakuCap(p: ParamSet, annualIncome: number): { name: string; cap: number } {
  const cost = p.kogaku.assumedMonthlyMedicalCost;
  for (const b of p.kogaku.brackets) {
    if (annualIncome >= b.minIncome) {
      return { name: b.name, cap: b.base + Math.max(0, cost - b.threshold) * b.rate };
    }
  }
  const last = p.kogaku.brackets[p.kogaku.brackets.length - 1];
  return { name: last.name, cap: last.base };
}

export function calcMedical(
  p: ParamSet,
  householdTopIncome: number,
  assets: number,
): MedicalResult {
  const { name, cap } = kogakuCap(p, householdTopIncome);
  const uncovered = v(p, "uncoveredMedicalMonthly");
  const mStd = v(p, "hospitalMonthsStd");
  const mLong = v(p, "hospitalMonthsLong");

  const burdenStandard = cap * mStd + uncovered * mStd;
  const burdenLong = cap * mLong + uncovered * mLong;

  const mult = v(p, "selfInsureMultiple");
  let verdict: MedicalVerdict;
  if (assets >= burdenLong * mult) verdict = "self_insurable";
  else if (assets >= burdenLong) verdict = "partial";
  else verdict = "needed";

  return { category: name, monthlyCap: cap, burdenStandard, burdenLong, assets, verdict };
}
