/**
 * 判断ポイント3行の検査（照合表 #8c）
 *
 * **モックの3行はサンプル世帯の事実**であって、別の世帯にそのまま出すと嘘になる。
 * 今日2回踏んだ「1世帯で正しく見える文が、隣の世帯で嘘になる」型なので、
 * **世帯ごとに中身が変わること**と、**無い事実を書かないこと**をここで固定する。
 *
 * 軸名（CLAUDE.md）：この3行は判定を述べない。述べるのは事実（年・額・前提）だけ。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { RUSHING_WORDS } from "../narrate/guard.js";
import { decisionPoints } from "./decisionPoints.js";
import { diagnose } from "./index.js";
import { projectDeath } from "./projection.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

function build(input: (typeof GOLDEN)[number]["input"]) {
  const d = diagnose(P, input, AS_OF).self;
  const pj = projectDeath(
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
  const danshinCovered =
    input.housing.type === "own" &&
    (input.housing.loan ?? 0) > 0 &&
    input.housing.danshin !== false;
  return decisionPoints(d, pj, { loan: input.housing.loan ?? null, danshinCovered });
}

describe("判断ポイント：世帯ごとに導出する", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：見出し語は体言止め、本文は です・ます`, () => {
      const points = build(g.input);
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) {
        expect(p.label.endsWith("。")).toBe(false);
        expect(p.body.endsWith("。")).toBe(true);
      }
    });

    it(`${g.id}：行動を急かす語彙を使わない`, () => {
      for (const p of build(g.input)) {
        for (const w of RUSHING_WORDS) {
          expect(`${p.label}${p.body}`).not.toContain(w);
        }
      }
    });
  }

  /**
   * **無い事実を書かない。** 団信の行は3通りに分かれ、世帯ごとに別の文が出る。
   * モックの「住まいは団信で守られています」を全世帯に出すと、
   * 団信なしの世帯で真逆のことを言う。
   */
  it("団信の行は世帯の状況で書き分ける（守られている／総額に乗っている／そもそも無い）", () => {
    const texts = GOLDEN.map((g) =>
      build(g.input)
        .map((p) => p.label)
        .join("|"),
    );
    expect(texts.some((t) => t.includes("住まいは団信で守られています"))).toBe(true);
    expect(
      texts.some(
        (t) =>
          t.includes("住宅ローンは総額に乗っています") ||
          t.includes("住居費は総額に入っていません"),
      ),
    ).toBe(true);
  });

  it("**世帯ごとに中身が変わる**（全世帯で同じ3行にならない）", () => {
    const joined = GOLDEN.map((g) =>
      build(g.input)
        .map((p) => `${p.label}/${p.body}`)
        .join("||"),
    );
    expect(new Set(joined).size).toBeGreaterThan(1);
  });

  it("余剰がある世帯では、その余剰が就労の前提の上にあることを言う", () => {
    const ample = GOLDEN.filter((g) => {
      const d = diagnose(P, g.input, AS_OF).self;
      return d.margin > 0 && d.income.survivorWork > 0;
    });
    expect(ample.length).toBeGreaterThan(0);
    for (const g of ample) {
      const labels = build(g.input)
        .map((p) => p.label)
        .join("|");
      expect(labels).toContain("就労の前提の上にあります");
    }
  });

  it("就労収入を見込んでいない世帯には、就労前提の行を出さない", () => {
    const noWork = GOLDEN.filter((g) => diagnose(P, g.input, AS_OF).self.income.survivorWork === 0);
    for (const g of noWork) {
      const labels = build(g.input)
        .map((p) => p.label)
        .join("|");
      expect(labels).toContain("就労収入は見込んでいません");
    }
  });
});
