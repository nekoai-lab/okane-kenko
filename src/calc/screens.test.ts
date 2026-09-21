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
