/**
 * 遺族の就労収入の感度（仕様 §5.3 T-E）
 *
 * **判定を支えている前提が外れたら何が起きるか**を、就労収入を
 * `現状 / その半額 / ゼロ` の3前提で回し直して測る。
 *
 * ここに置く理由：
 * - **画面から呼ぶ前に単体で検査できるようにする。** 分岐が画面の中にあると、
 *   「実データでたまたま出た分岐」しか確かめられない
 * - 金額を作るのは `src/calc` だけ（CLAUDE.md 責務境界）。画面は返った値を差し込むだけ
 *
 * **軸を間違えない。** ここが返す判定は `Verdict3`（保障と必要額の過不足）で、
 * カードのバッジと同じ軸である。`DeathResult.verdict`（`ample` / `shortage` など）は
 * **必要額が出るかどうかのニーズ軸**で、別物。
 * 2026-09-21、この2つを取り違えて「感度表では shortage なのにカードは変わらない」という
 * 食い違いの報告が出た。実際は両方とも正しく、比べていた軸が違っただけだった。
 */
import type { DiagnoseInput } from "./index.js";
import type { ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import { simulate } from "./simulate.js";
import type { Verdict3 } from "./verdict3.js";
import { verdict3 } from "./verdict3.js";

/** どちらのケースの感度を測るか。`self` は本人が亡くなるケース */
export type DeathCase = "self" | "spouse";

export type SensitivityBranch =
  /** 半額でもゼロでも判定が動く */
  | "both_change"
  /** 半額では動かず、ゼロで動く */
  | "zero_only"
  /** どちらでも判定は動かない（必要額は動きうる） */
  | "no_verdict_change";

export interface Range {
  low: number;
  high: number;
}

export interface SurvivorIncomeSensitivity {
  branch: SensitivityBranch;
  verdictNow: Verdict3;
  verdictAtHalf: Verdict3;
  verdictAtZero: Verdict3;
  /** 遺族の就労収入の合計（円・手取りベース） */
  workTotal: number;
  /** 回答された年収（円・額面） */
  annualGross: number;
  /** 計算に使っている年額（円・手取り） */
  annualNet: number;
  /** 半額にしたときの手取り年額（円） */
  halfNet: number;
  /** 末子独立後に使っている年額（円・手取り）。`annualNet` と違うと単純な掛け算にならない */
  netAfter: number;
  yearsDependent: number;
  yearsAlone: number;
  yearsTotal: number;
  needNow: Range;
  needAtHalf: Range;
  needAtZero: Range;
}

/**
 * 3つの判定から分岐を選ぶ。**純粋関数**。
 *
 * ゼロは半額より必ず厳しいので「半額で動いてゼロで戻る」は起きないが、
 * 起きたとしても `both_change` に落ちて言い過ぎにならない側に倒す。
 */
export function pickBranch(now: Verdict3, atHalf: Verdict3, atZero: Verdict3): SensitivityBranch {
  if (atHalf === now && atZero === now) return "no_verdict_change";
  if (atHalf === now) return "zero_only";
  return "both_change";
}

/**
 * 遺族の就労収入を動かして、判定と必要額がどう動くかを返す。
 *
 * **変えるのは遺族（survivor）の収入。** 本人が亡くなるケースなら配偶者の収入、
 * 配偶者が亡くなるケースなら本人の収入を動かす。亡くなる側の収入を動かすと
 * 遺族年金の額まで変わってしまい、測りたいものが測れない。
 *
 * 遺族の収入が元から0の世帯は `null`（動かす余地が無い）。
 */
export function survivorIncomeSensitivity(
  p: ParamSet,
  input: DiagnoseInput,
  who: DeathCase,
  asOf: Date,
): SurvivorIncomeSensitivity | null {
  const survivor = who === "self" ? input.spouse : input.self;
  const coverage = who === "self" ? input.coverageSelf : input.coverageSpouse;
  if (!survivor || survivor.income <= 0) return null;

  const at = (income: number) => {
    const answers =
      who === "self"
        ? { ...input, spouse: { ...input.spouse!, income } }
        : { ...input, self: { ...input.self, income } };
    const d = simulate(p, { answers, asOf }, "death").death;
    return who === "self" ? d?.self : d?.spouse;
  };

  const now = at(survivor.income);
  const halfGross = Math.round(survivor.income / 2);
  const half = at(halfGross);
  const zero = at(0);
  if (!now || !half || !zero) return null;

  const verdictNow = verdict3(coverage, now.range.low, now.range.high);
  const verdictAtHalf = verdict3(coverage, half.range.low, half.range.high);
  const verdictAtZero = verdict3(coverage, zero.range.low, zero.range.high);

  const ratio = v(p, "netIncomeRatio");
  const annualNet = survivor.income * ratio;

  return {
    branch: pickBranch(verdictNow, verdictAtHalf, verdictAtZero),
    verdictNow,
    verdictAtHalf,
    verdictAtZero,
    workTotal: now.income.survivorWork,
    annualGross: survivor.income,
    annualNet,
    halfNet: halfGross * ratio,
    netAfter: Math.max(annualNet, v(p, "postIndepMinIncome")),
    yearsDependent: now.years.dependent,
    yearsAlone: now.years.alone,
    yearsTotal: now.years.total,
    needNow: now.range,
    needAtHalf: half.range,
    needAtZero: zero.range,
  };
}
