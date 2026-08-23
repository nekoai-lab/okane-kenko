/**
 * 正規化のテスト（DR-02）
 *
 * レンジ区分→代表値の写像、年齢算出、生活費の年収推定、欠損時の推定フラグを固定する。
 * 金額に直結するので、代表値を変えたらこのテストの差分を必ず記録すること。
 */
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { normalize } from "./normalize.js";
import type { WizardSelections } from "./types.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00"); // asOfYear = 2026

const base: WizardSelections = {
  selfBirthYear: 1989,
  selfEmployment: "employee",
  hasSpouse: true,
  spouseBirthYear: 1991,
  spouseEmployment: "employee",
  childrenBirthYears: [2024],
  educationPlan: "public",
  selfIncome: "lt600",
  spouseIncome: "lt400",
  assets: "lt500",
  livingCost: "lt30",
  housing: "own_loan",
  loan: "lt3000",
  danshin: "yes",
  coverageSelf: "m1000",
  coverageSpouse: "none",
};

describe("normalize：レンジ→代表値の写像", () => {
  it("区分を代表値・年齢・子年齢に写像する", () => {
    const { input, estimations } = normalize(P, base, AS_OF);
    expect(input.self).toEqual({ age: 37, income: 5_000_000, employment: "employee" });
    expect(input.spouse).toEqual({ age: 35, income: 2_000_000, employment: "employee" });
    expect(input.children).toEqual([2]);
    expect(input.assets).toBe(4_000_000);
    expect(input.monthlyLiving).toBe(275_000);
    expect(input.housing).toEqual({ type: "own", loan: 25_000_000, danshin: true });
    expect(input.coverageSelf).toBe(10_000_000); // m1000
    expect(input.coverageSpouse).toBe(0); // none = 加入していない
    expect(estimations).toEqual([]);
  });

  it("保険が分からないなら coverage は null（過不足を pending にする）", () => {
    const { input } = normalize(P, { ...base, coverageSelf: "unknown" }, AS_OF);
    expect(input.coverageSelf).toBeNull();
  });

  it("配偶者なしなら coverageSpouse は渡さない（配偶者ケースを作らない）", () => {
    const { input } = normalize(
      P,
      { ...base, hasSpouse: false, spouseBirthYear: undefined, coverageSpouse: undefined },
      AS_OF,
    );
    expect(input.coverageSpouse).toBeUndefined();
  });

  it("公務員は employee、自営は self、専業は none に写像する", () => {
    const { input } = normalize(
      P,
      { ...base, selfEmployment: "civil_servant", spouseEmployment: "none", spouseIncome: "none" },
      AS_OF,
    );
    expect(input.self.employment).toBe("employee");
    expect(input.spouse?.employment).toBe("none");
    expect(input.spouse?.income).toBe(0);
  });

  it("配偶者なしなら spouse は null", () => {
    const { input } = normalize(
      P,
      { ...base, hasSpouse: false, spouseBirthYear: undefined },
      AS_OF,
    );
    expect(input.spouse).toBeNull();
  });

  it("賃貸は住居費を別に足さない（家賃は生活費に含む前提）", () => {
    const { input } = normalize(P, { ...base, housing: "rent", loan: undefined }, AS_OF);
    expect(input.housing).toEqual({ type: "rent" });
  });

  it("団信が分からないなら undefined のまま渡す（算定側が併記する）", () => {
    const { input } = normalize(P, { ...base, danshin: "unknown" }, AS_OF);
    expect(input.housing).toEqual({ type: "own", loan: 25_000_000, danshin: undefined });
  });
});

describe("normalize：生活費の年収推定（§4.2.1）", () => {
  it("世帯手取り × 0.75 / 12 で月額を出す", () => {
    const { input, estimations } = normalize(P, { ...base, livingCost: "estimate" }, AS_OF);
    // 世帯年収 500万+200万=700万 → 手取り ×0.80=560万 → ×0.75/12 = 350,000
    expect(input.monthlyLiving).toBe(350_000);
    expect(estimations.some((e) => e.reason === "estimated_from_income")).toBe(true);
  });
});

describe("normalize：子の進路（S2）", () => {
  it("private を選ぶとそのまま渡す", () => {
    const { input } = normalize(P, { ...base, educationPlan: "private" }, AS_OF);
    expect(input.educationPlan).toBe("private");
  });

  it("まだ決めていないは公立中心で仮置き＋推定フラグ", () => {
    const { input, estimations } = normalize(P, { ...base, educationPlan: "undecided" }, AS_OF);
    expect(input.educationPlan).toBe("public");
    expect(estimations.some((e) => e.field === "educationPlan" && e.reason === "undecided")).toBe(
      true,
    );
  });

  it("子がいなければ進路フラグは立てない", () => {
    const { estimations } = normalize(
      P,
      { ...base, childrenBirthYears: [], educationPlan: undefined },
      AS_OF,
    );
    expect(estimations.some((e) => e.field === "educationPlan")).toBe(false);
  });
});

describe("normalize：欠損時の推定フラグ（DR-03）", () => {
  it("答えたくない・分からないを推定として記録する", () => {
    const { estimations } = normalize(
      P,
      { ...base, selfIncome: "prefer_not", assets: "unknown", loan: "unknown" },
      AS_OF,
    );
    const fields = estimations.map((e) => e.field).sort();
    expect(fields).toEqual(["assets", "loan", "selfIncome"]);
  });
});
