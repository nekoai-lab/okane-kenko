/**
 * ゴールデンテスト（受入基準 A-1 / PR-06）
 *
 * 算定エンジンは「同一入力・同一パラメータ版で必ず同一結果」でなければならない（AR-06）。
 * パラメータを更新したら必ずこのテストを再実行し、差分を記録すること。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "./households.js";

const MAN = 10_000;
const P = loadParams("2026-08");
/** パラメータの有効期間内の日付で固定する（期限切れ検知テストは別途） */
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
const man = (x: number) => Math.round(x / MAN);

describe("ゴールデンテスト：10世帯・19の死亡ケース", () => {
  for (const c of GOLDEN) {
    describe(`${c.id} ${c.label}`, () => {
      const r = diagnose(P, c.input, AS_OF);

      it("本人が亡くなるケースの結論・レンジ・過不足が一致する", () => {
        expect(r.self.verdict).toBe(c.expect.self.verdict);
        expect(man(r.self.range.low)).toBe(c.expect.self.low);
        expect(man(r.self.range.high)).toBe(c.expect.self.high);
        expect(r.self.gap.kind).toBe(c.expect.self.gap);
        expect(man(r.self.gap.amount)).toBe(c.expect.self.gapAmount);
      });

      if (c.expect.spouse) {
        it("配偶者が亡くなるケースの結論・レンジ・過不足が一致する", () => {
          expect(r.spouse).not.toBeNull();
          expect(r.spouse!.verdict).toBe(c.expect.spouse!.verdict);
          expect(man(r.spouse!.range.low)).toBe(c.expect.spouse!.low);
          expect(man(r.spouse!.range.high)).toBe(c.expect.spouse!.high);
          expect(r.spouse!.gap.kind).toBe(c.expect.spouse!.gap);
          expect(man(r.spouse!.gap.amount)).toBe(c.expect.spouse!.gapAmount);
        });
      }

      it("医療保障の判定が一致する", () => {
        expect(r.medical.verdict).toBe(c.expect.medical);
      });

      it("2028年改正の該当判定が一致する", () => {
        expect(r.reform2028.applicable).toBe(c.expect.reform2028);
      });

      it("世帯としての結論が一致する", () => {
        expect(r.householdHeadline.kind).toBe(c.expect.headline);
      });

      it("支出計と収入計が内訳の合計と一致する（内部整合）", () => {
        const e = r.self.expense;
        expect(e.total).toBeCloseTo(
          e.livingChild + e.livingAlone + e.education + e.housing + e.funeral,
          0,
        );
        const i = r.self.income;
        expect(i.total).toBeCloseTo(
          i.pensionBasic + i.pensionKosei + i.chukoreiKafu + i.survivorWork + i.assets,
          0,
        );
      });
    });
  }
});

describe("再現性（AR-06）", () => {
  it("同一入力を10回実行しても結論と全数値が一致する", () => {
    const c = GOLDEN[1]; // 本命ペルソナ（shortage が出るケース）
    const first = JSON.stringify(diagnose(P, c.input, AS_OF));
    for (let i = 0; i < 9; i++) {
      expect(JSON.stringify(diagnose(P, c.input, AS_OF))).toBe(first);
    }
  });
});

describe("芯の担保：煽らないこと", () => {
  it("扶養家族がいない世帯に『安心の上乗せ』を提示しない（葬儀・予備費のみ）", () => {
    const r = diagnose(P, GOLDEN[4].input, AS_OF); // GT-05 独身
    expect(r.self.verdict).toBe("not_needed");
    expect(r.self.range.low).toBe(r.self.expense.funeral);
    expect(r.self.range.high).toBe(r.self.expense.funeral);
  });

  it("余剰が大きい世帯には『上乗せも不要』と言い切る", () => {
    const r = diagnose(P, GOLDEN[8].input, AS_OF); // GT-09 高所得・貯蓄2000万
    expect(r.self.verdict).toBe("ample");
    expect(r.self.margin).toBeGreaterThan(r.self.expense.total * 0.2);
  });

  it("子のいる世帯には『2028年改正は直撃しない』と言える", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF);
    expect(r.reform2028.applicable).toBe(false);
    expect(r.reform2028.reason).toContain("直撃しません");
  });

  it("『入らなくていい』と言える箇所が全体の過半で検出される（FR-19 / ADR-009）", () => {
    const reducible = GOLDEN.filter(
      (c) => diagnose(P, c.input, AS_OF).householdHeadline.totalExcess > 0,
    ).length;
    expect(reducible).toBeGreaterThan(GOLDEN.length / 2);
  });
});

describe("世帯単位で見ないと分からないこと（ADR-007）", () => {
  it("本人が過剰・配偶者が不足なら rebalanceable と判定する", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF); // GT-01
    expect(r.householdHeadline.kind).toBe("rebalanceable");
    expect(r.householdHeadline.totalExcess).toBeGreaterThan(0);
    expect(r.householdHeadline.totalShortage).toBeGreaterThan(0);
  });

  it("配偶者の保険が未入力でも診断は完走する（段階的に返す・ADR-007b）", () => {
    const { coverageSpouse, ...rest } = GOLDEN[0].input;
    const r = diagnose(P, rest, AS_OF);
    expect(r.spouse).toBeNull();
    expect(r.self.verdict).toBe("ample");
  });

  it("現在の保険が分からなくても必要額は出る（FR-14）", () => {
    const r = diagnose(P, { ...GOLDEN[1].input, coverageSelf: null }, AS_OF);
    expect(r.self.verdict).toBe("shortage");
    expect(r.self.gap.kind).toBe("pending");
    expect(r.self.assumptions.some((a) => a.field === "currentCoverage")).toBe(true);
  });
});

describe("自営世帯（遺族厚生年金なし）", () => {
  it("同条件の会社員より必要額が大きくなる", () => {
    const selfEmployed = diagnose(P, GOLDEN[5].input, AS_OF);
    const asEmployee = diagnose(
      P,
      { ...GOLDEN[5].input, self: { ...GOLDEN[5].input.self, employment: "employee" } },
      AS_OF,
    );
    expect(selfEmployed.self.income.pensionKosei).toBe(0);
    expect(selfEmployed.self.rawNeed).toBeGreaterThan(asEmployee.self.rawNeed);
  });
});

describe("団信の扱い（§9-6）", () => {
  it("団信が『分からない』ならありとして算定し、その事実を assumptions に残す", () => {
    const { danshin, ...housing } = GOLDEN[0].input.housing;
    const r = diagnose(P, { ...GOLDEN[0].input, housing }, AS_OF);
    expect(r.self.expense.housing).toBe(0);
    const a = r.self.assumptions.find((x) => x.field === "housing.danshin");
    expect(a).toBeDefined();
    expect(a!.note).toContain("団信がない場合は必要額が");
  });

  it("団信なしならローン残高が必要額に乗る", () => {
    const r = diagnose(P, GOLDEN[6].input, AS_OF); // GT-07
    expect(r.self.expense.housing).toBe(GOLDEN[6].input.housing.loan);
  });
});
