import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { ageAsOf, crossedMilestones, milestoneAges } from "./milestones.js";

const P = loadParams("2026-08");

describe("milestoneAges：学齢の節目年齢", () => {
  it("params の教育費段階から節目年齢を導く", () => {
    expect(milestoneAges(P)).toEqual([3, 6, 12, 15, 18, 22]);
  });
});

describe("ageAsOf：基準日時点の年齢", () => {
  it("年単位で年齢を出す(normalizeと同じ簡略化)", () => {
    expect(ageAsOf(2020, new Date("2026-01-01T00:00:00+09:00"))).toBe(6);
  });
});

describe("crossedMilestones：節目到達の判定", () => {
  const LAST = new Date("2025-12-01T00:00:00+09:00"); // asOfYear = 2025
  const NOW = new Date("2026-06-01T00:00:00+09:00"); // asOfYear = 2026

  it("前回チェック時は5歳・今回は6歳なら、小学校の節目(6)を検知する", () => {
    const result = crossedMilestones(P, [2020], LAST, NOW);
    expect(result).toEqual([{ birthYear: 2020, age: 6 }]);
  });

  it("節目をまたいでいなければ何も検知しない", () => {
    const result = crossedMilestones(P, [2020], NOW, NOW);
    expect(result).toEqual([]);
  });

  it("複数の子がいれば、それぞれ独立に判定する", () => {
    const result = crossedMilestones(P, [2020, 2011], LAST, NOW);
    // 2020年生まれ: 2025年5歳→2026年6歳(節目)。2011年生まれ: 2025年14歳→2026年15歳(節目)
    expect(result).toEqual([
      { birthYear: 2020, age: 6 },
      { birthYear: 2011, age: 15 },
    ]);
  });
});
