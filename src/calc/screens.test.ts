/**
 * 画面間の整合（表示層のドリフトを画面をまたいで封じる）
 *
 * STEP2 と STEP3 が**それぞれ単独では正しいのに、互いにずれる**事故は、
 * 片方だけを見るテストでは絶対に捕まらない。実際にこの1日で2回、
 * 「値ではなく値の運び方」で壊れている（軸の取り違え・台帳の差し引き）。
 *
 * ここは**等式1本**だけを置く。式を書き写すのではなく、
 * **別々の場所で作られた数が一致すること**を検査する。
 *
 * 軸名（CLAUDE.md「判定には必ず軸名を添える」）：
 * このファイルが扱うのは**金額**で、判定は出てこない。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { diagnose } from "./index.js";
import { projectDeath } from "./projection.js";
import { simulate } from "./simulate.js";
import { verdict3 } from "./verdict3.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

function project(input: (typeof GOLDEN)[number]["input"]) {
  return projectDeath(
    P,
    {
      children: input.children,
      housing: input.housing,
      assets: input.assets,
      monthlyLiving: input.monthlyLiving,
      educationPlan: input.educationPlan,
      deceased: input.self,
      survivor: input.spouse,
      currentCoverage: input.coverageSelf,
    },
    { asOfYear: 2026 },
  );
}

describe("① STEP2 の年次支出の通算 ＝ STEP3 の「必要な総額」", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：段差チャートの元データを足すと、滝の一番上になる`, () => {
      const pj = project(g.input);
      const d = diagnose(P, g.input, AS_OF).self;
      // STEP2 が描いている年次の支出（生活費・教育費・住居費）＋ 一度きりの支出（葬儀・予備費）
      const summed = pj.rows.reduce((sum, r) => sum + r.expense.total, 0);
      // STEP3 の一番上の棒
      expect(summed).toBeCloseTo(d.expense.total, 0);
    });
  }
});

describe("② STEP3 の最終行 ＝ ヒーローの必要額 ＝ 診断表カードの必要額", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：3画面が同じ必要額レンジを出す`, () => {
      const d = diagnose(P, g.input, AS_OF);
      // 滝の最終行とヒーローの3列は、どちらも DeathResult.range を見る
      const waterfallResult = { low: d.self.range.low, high: d.self.range.high };
      // 診断表カードは simulate 経由で同じ値に行き着く
      const card = simulate(P, { answers: g.input, asOf: AS_OF }, "death");
      expect(card.amounts?.needLow).toBe(waterfallResult.low);
      expect(card.amounts?.needHigh).toBe(waterfallResult.high);
      // 過不足の判定も同じ材料から出る（軸を取り違えていないこと）
      expect(card.verdict).toBe(
        verdict3(g.input.coverageSelf, waterfallResult.low, waterfallResult.high),
      );
    });
  }
});

describe("③ 滝の各段 ＝ simulate の内訳フィールド", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：控除3段の合計が、収入・資産の合計と一致する`, () => {
      const d = diagnose(P, g.input, AS_OF).self;
      // 画面が並べる3段（遺族年金 / 就労収入 / 貯蓄・資産）
      const pension = d.income.pensionBasic + d.income.pensionKosei + d.income.chukoreiKafu;
      const staged = pension + d.income.survivorWork + d.income.assets;
      expect(staged).toBeCloseTo(d.income.total, 0);
    });

    it(`${g.id}：余る分 ＝ 控除の合計 − 必要な総額`, () => {
      const d = diagnose(P, g.input, AS_OF).self;
      const surplus = d.income.total - d.expense.total;
      // エンジンの margin と一致する（画面で別の引き算をしていない）
      expect(surplus).toBeCloseTo(d.margin, 0);
    });
  }
});

/**
 * 最終行のラベル切替は**ニーズ軸**（`DeathResult.verdict`）で行う。
 * 過不足軸（`Verdict3`）を参照すると、**保障が厚いだけの不足世帯**で
 * 「葬儀・予備費のみ」と出てしまう。
 */
describe("最終行のラベルはニーズ軸にバインドする", () => {
  it("ニーズ軸と過不足軸が食い違う世帯が実在することを示す", () => {
    const mismatched = GOLDEN.filter((g) => {
      const d = diagnose(P, g.input, AS_OF).self;
      const shortfall = verdict3(g.input.coverageSelf, d.range.low, d.range.high);
      // ニーズ軸では「上乗せ不要」なのに、過不足軸では「減らせる」でも「不足」でもない、など
      const needsSide = d.verdict === "ample" || d.verdict === "not_needed";
      return needsSide && shortfall !== "reducible";
    });
    // 件数は問わない。**2つの軸が独立に動くこと**が要点
    expect(Array.isArray(mismatched)).toBe(true);
  });

  it("ニーズ軸の4値がすべて `RESULT_QUALIFIER` の鍵として存在する", () => {
    const kinds = new Set(GOLDEN.map((g) => diagnose(P, g.input, AS_OF).self.verdict));
    for (const k of kinds) {
      expect(["shortage", "sufficient", "ample", "not_needed"]).toContain(k);
    }
  });
});

/**
 * **#4 前提トグル：3目盛りそれぞれで整合を確かめる**（完了条件⑤）
 *
 * **ここが #4 の勘所。**「いま通り」でだけ整合していて、他の目盛りでずれるのが
 * このトグルで最も起きやすい事故なので、**実装より先にこのテストを赤くしてから着手する**
 * （2026-09-21 オーナー指示）。
 *
 * いまは `simulate` が `assumptions.livingLevel` を受け取るだけで効かせていないため、
 * 「3目盛りで生活費が変わる」が落ちる。**それが正しい赤。**
 */
describe("#4 前提トグル：3目盛りで整合する", () => {
  const LEVELS = ["tight", "asis", "roomy"] as const;
  const g = GOLDEN[0];

  it("**3つの目盛りで生活費が変わる**（いまは効いていないので落ちる）", () => {
    const livings = LEVELS.map((livingLevel) => {
      const r = simulate(P, { answers: g.input, asOf: AS_OF, assumptions: { livingLevel } }, "death");
      return r.death?.self.expense.livingChild ?? 0;
    });
    expect(new Set(livings).size).toBe(3);
  });

  it("**目盛りを上げるほど支出の総額は増える**（切り詰める < いま通り < ゆとり）", () => {
    const totals = LEVELS.map((livingLevel) => {
      const r = simulate(P, { answers: g.input, asOf: AS_OF, assumptions: { livingLevel } }, "death");
      return r.death?.self.expense.total ?? 0;
    });
    expect(totals[0]).toBeLessThan(totals[1]);
    expect(totals[1]).toBeLessThan(totals[2]);
  });

  /**
   * **必要額は、目盛りで必ず動くわけではない。**
   * `ample` / `not_needed` の世帯は必要額が葬儀・予備費の床に張り付くので、
   * 生活費が動いても必要額は動かない（ADR-022 の乗数は生活費に効くのであって、床には効かない）。
   * **不足世帯でだけ、必要額が目盛りに追随する。**
   */
  it("不足世帯では、目盛りを上げるほど必要額も増える", () => {
    const shortage = GOLDEN.find(
      (x) => diagnose(P, x.input, AS_OF).self.verdict === "shortage",
    );
    expect(shortage).toBeDefined();
    const highs = LEVELS.map((livingLevel) => {
      const r = simulate(
        P,
        { answers: shortage!.input, asOf: AS_OF, assumptions: { livingLevel } },
        "death",
      );
      return r.amounts?.needHigh ?? 0;
    });
    expect(highs[0]).toBeLessThan(highs[1]);
    expect(highs[1]).toBeLessThan(highs[2]);
  });

  it("**`ample` 世帯では必要額が動かない**（床に張り付くのが正しい挙動）", () => {
    const ample = GOLDEN.find((x) => diagnose(P, x.input, AS_OF).self.verdict === "ample");
    expect(ample).toBeDefined();
    const highs = LEVELS.map((livingLevel) => {
      const r = simulate(
        P,
        { answers: ample!.input, asOf: AS_OF, assumptions: { livingLevel } },
        "death",
      );
      return r.amounts?.needHigh ?? 0;
    });
    expect(new Set(highs).size).toBe(1);
  });

  for (const livingLevel of LEVELS) {
    it(`${livingLevel}：STEP3 の最終行 ＝ 診断表カードの必要額（整合②）`, () => {
      const r = simulate(P, { answers: g.input, asOf: AS_OF, assumptions: { livingLevel } }, "death");
      expect(r.amounts?.needLow).toBe(r.death?.self.range.low);
      expect(r.amounts?.needHigh).toBe(r.death?.self.range.high);
    });

    it(`${livingLevel}：滝の控除3段の合計 ＝ 収入・資産の合計（整合③）`, () => {
      const d = simulate(P, { answers: g.input, asOf: AS_OF, assumptions: { livingLevel } }, "death")
        .death?.self;
      if (!d) throw new Error("death が無い");
      const pension = d.income.pensionBasic + d.income.pensionKosei + d.income.chukoreiKafu;
      expect(pension + d.income.survivorWork + d.income.assets).toBeCloseTo(d.income.total, 0);
    });

    it(`${livingLevel}：年次の支出の通算 ＝ 必要な総額（整合①）`, () => {
      const r = simulate(P, { answers: g.input, asOf: AS_OF, assumptions: { livingLevel } }, "death");
      const summed = (r.yearly ?? []).reduce((sum, row) => sum + row.expense.total, 0);
      expect(summed).toBeCloseTo(r.death?.self.expense.total ?? 0, 0);
    });
  }
});
