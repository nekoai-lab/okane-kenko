/**
 * 敵対テスト（再設計フェーズ1・タスク5／仕様 §7-1）
 *
 * **これは値のテストではなく、方向のテストである。**
 * 両端のプロファイルを置いて、「向きが逆になっていないか」だけを見る。
 * 期待するのは判定ラベルだけで、金額は固定しない（金額は正本 xlsx の仕事）。
 *
 * ⚠️ **落ちたら、期待値を疑う前にロジックを疑うこと。**
 * 「最も保障が要る世帯で減らせると言う」「最も要らない世帯で不足だと言う」は、
 * 計算がどこかで逆を向いているということで、このテストはそれだけを捕まえるために在る。
 *
 * 合成入力を使う（`docs/算定テスト_10世帯.xlsx` に足さない。正本は実在的世帯のまま・ADR-021）。
 */
import { describe, expect, it } from "vitest";
import type { DiagnoseInput } from "./index.js";
import { diagnose } from "./index.js";
import { loadParams } from "../params/index.js";
import { aggregateHousehold, verdict3 } from "./verdict3.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");
const man = (n: number) => n * 10_000;

/** 世帯としての判定を出す（個人3値 → 世帯4値） */
function householdVerdict(input: DiagnoseInput) {
  const r = diagnose(P, input, AS_OF);
  const vs = [verdict3(input.coverageSelf, r.self.range.low, r.self.range.high)];
  if (r.spouse) {
    vs.push(verdict3(input.coverageSpouse, r.spouse.range.low, r.spouse.range.high));
  }
  return { result: r, self: vs[0], household: aggregateHousehold(vs) };
}

/**
 * いちばん保障が要る側。
 * 片働き（配偶者に収入が無い）・子3人が未就学・賃貸・貯蓄なし・団信なし（そもそも賃貸）。
 */
const MOST_NEEDED: DiagnoseInput = {
  self: { age: 35, income: 4_000_000, employment: "employee" },
  spouse: { age: 33, income: 0, employment: "none" },
  children: [4, 2, 0],
  housing: { type: "rent" },
  assets: 0,
  monthlyLiving: 280_000,
  educationPlan: "public",
  // ごく一般的な保障額。これで「減らせる」が出たら、どこかが逆を向いている
  coverageSelf: man(3000),
  coverageSpouse: man(0),
};

/**
 * いちばん保障が要らない側。
 * 共働きで収入が厚い・子は独立済み・持ち家ローン完済・貯蓄が厚い。
 */
const LEAST_NEEDED: DiagnoseInput = {
  self: { age: 55, income: 12_000_000, employment: "employee" },
  spouse: { age: 53, income: 8_000_000, employment: "employee" },
  children: [],
  housing: { type: "own", loan: 0 },
  assets: 50_000_000,
  monthlyLiving: 250_000,
  educationPlan: "public",
  coverageSelf: man(3000),
  coverageSpouse: man(3000),
};

describe("敵対テスト：向きが逆になっていないか", () => {
  it("最も保障が要るプロファイルで『減らせる可能性』を出さない", () => {
    const { self, household } = householdVerdict(MOST_NEEDED);
    expect(self).not.toBe("reducible");
    expect(household).not.toBe("reducible");
  });

  it("最も保障が要らないプロファイルで『不足の可能性』を出さない", () => {
    const { self, household } = householdVerdict(LEAST_NEEDED);
    expect(self).not.toBe("shortage");
    expect(household).not.toBe("shortage");
  });

  it("両端で必要額の大小が逆転しない", () => {
    const a = diagnose(P, MOST_NEEDED, AS_OF);
    const b = diagnose(P, LEAST_NEEDED, AS_OF);
    expect(a.self.range.high).toBeGreaterThan(b.self.range.high);
  });

  /**
   * 片働き・子3人・賃貸・貯蓄なしで、保障を厚くしていっても
   * **どこかで「減らせる」に変わる**こと自体は正しい（際限なく不足と言い続けない）。
   * ここで見るのは「変わる」ことであって、変わる金額ではない。
   */
  it("保障を十分に厚くすれば、最も要る世帯でも『減らせる』に変わる", () => {
    const rich = { ...MOST_NEEDED, coverageSelf: man(20000), coverageSpouse: man(20000) };
    expect(householdVerdict(rich).self).toBe("reducible");
  });

  /**
   * 逆向きの確認。最も要らない世帯でも、保障が葬儀・予備費にも届かなければ不足になる。
   * **「金持ちだから常に減らせる」という固定の答えを返していない**ことの担保。
   */
  it("最も要らない世帯でも、保障が0なら『不足』になる", () => {
    const none = { ...LEAST_NEEDED, coverageSelf: 0, coverageSpouse: 0 };
    expect(householdVerdict(none).self).toBe("shortage");
  });
});
