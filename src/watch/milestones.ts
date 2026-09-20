/**
 * 子の学齢の節目到達を判定する(気づき通知フェーズ2aのトリガー)。
 *
 * 節目の年齢は params の教育費段階(src/params/index.ts の EducationParams)から取る。
 * コードに年齢をハードコードしない(CLAUDE.mdの制度パラメータの扱い)。
 * 年齢は「基準年 − 生年」(normalize.ts と同じ年単位の簡略化。日付までは持たない)。
 */
import type { ParamSet } from "../params/index.js";
import { jstYear } from "../time/jstYear.js";

/** 学齢の節目となる年齢の一覧(幼稚園・小学校・中学校・高校・大学・独立) */
export function milestoneAges(p: ParamSet): number[] {
  const s = p.education.stages;
  return [
    s.kinder.fromAge,
    s.primary.fromAge,
    s.junior.fromAge,
    s.high.fromAge,
    p.education.university.fromAge,
    p.education.university.toAge + 1,
  ];
}

export function ageAsOf(birthYear: number, asOf: Date): number {
  return jstYear(asOf) - birthYear;
}

export interface MilestoneCrossing {
  /** 節目に到達した子の生年 */
  birthYear: number;
  /** 到達した節目の年齢 */
  age: number;
}

/**
 * 世帯の子どもたちについて、`lastCheckedAt` から `now` の間に学齢の節目を
 * 越えた子を検知する。
 */
export function crossedMilestones(
  p: ParamSet,
  childrenBirthYears: number[],
  lastCheckedAt: Date,
  now: Date,
): MilestoneCrossing[] {
  const ages = milestoneAges(p);
  const crossings: MilestoneCrossing[] = [];
  for (const birthYear of childrenBirthYears) {
    const before = ageAsOf(birthYear, lastCheckedAt);
    const after = ageAsOf(birthYear, now);
    for (const age of ages) {
      if (before < age && after >= age) {
        crossings.push({ birthYear, age });
      }
    }
  }
  return crossings;
}
