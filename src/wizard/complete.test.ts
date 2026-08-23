import { describe, expect, it } from "vitest";
import { isComplete, toCompleteSelections } from "./complete.js";
import type { WizardSelections } from "./types.js";

const full: WizardSelections = {
  selfBirthYear: 1989,
  selfEmployment: "employee",
  hasSpouse: true,
  spouseBirthYear: 1991,
  spouseEmployment: "none",
  childrenBirthYears: [2018],
  educationPlan: "public",
  selfIncome: "lt600",
  spouseIncome: "none",
  assets: "lt500",
  livingCost: "lt30",
  housing: "own_loan",
  loan: "lt3000",
  danshin: "yes",
  coverageSelf: "m1000",
  coverageSpouse: "none",
};

describe("toCompleteSelections", () => {
  it("すべて埋まっていれば選択を返す", () => {
    expect(toCompleteSelections(full)).toEqual(full);
  });

  it("必須が欠ければ null", () => {
    const { selfIncome: _drop, ...rest } = full;
    expect(toCompleteSelections(rest)).toBeNull();
  });

  it("配偶者なしなら配偶者項目は不要（0人は空配列で回答済み）", () => {
    const single: Partial<WizardSelections> = {
      selfBirthYear: 1990,
      selfEmployment: "self",
      hasSpouse: false,
      childrenBirthYears: [],
      selfIncome: "lt400",
      assets: "lt100",
      livingCost: "lt20",
      housing: "rent",
      coverageSelf: "unknown",
    };
    expect(isComplete(single)).toBe(true);
  });

  it("本人の保障額が未回答なら未完了", () => {
    const { coverageSelf: _drop, ...rest } = full;
    expect(isComplete(rest)).toBe(false);
  });

  it("配偶者ありで配偶者の保障額が未回答なら未完了", () => {
    const { coverageSpouse: _drop, ...rest } = full;
    expect(isComplete(rest)).toBe(false);
  });

  it("子がいるのに進路が未回答なら未完了", () => {
    const { educationPlan: _drop, ...rest } = full;
    expect(isComplete(rest)).toBe(false);
  });

  it("持ち家ローンありで団信未回答なら未完了", () => {
    const { danshin: _drop, ...rest } = full;
    expect(isComplete(rest)).toBe(false);
  });

  it("賃貸ならローン・団信は不要", () => {
    const rent = { ...full, housing: "rent" as const, loan: undefined, danshin: undefined };
    expect(isComplete(rent)).toBe(true);
  });
});
