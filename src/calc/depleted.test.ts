/**
 * 貯蓄が尽きる年のマーカー（`Vitals` からの移設・2026-09-21）
 *
 * 旧「検査値パネル」は `貯蓄が尽きる年 / 2041年ごろ` を数字タイルで出していた。
 * 撤去にあたり、段差チャート上の縦マーカーへ移した（本籍）。
 *
 * **ここが固定するのは「出す／出さない」の分岐。**
 * マーカーの描画そのものはテストで見えないが、
 * **尽きない世帯に「尽きる」の目印を出す**という壊れ方は、
 * `decisionPoints` の「モックの3行を全世帯に出すと隣の世帯で嘘になる」と同じ型で、
 * エラーを出さずに嘘をつく。分岐の材料（`projection.depletedAt`）を直接固定する。
 *
 * 軸名（CLAUDE.md）：必要額の判定（ニーズ軸）を使う。過不足軸は出てこない。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { diagnose, toHousehold } from "./index.js";
import { projectDeath } from "./projection.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

const project = (input: (typeof GOLDEN)[number]["input"]) =>
  projectDeath(P, toHousehold(input, "self"), { asOfYear: 2026 });

describe("段差チャートの「貯蓄が尽きる年」マーカー", () => {
  it("**尽きる世帯ではマーカーの年が取れる**（算定期間のなかの年である）", () => {
    const depleting = GOLDEN.filter((g) => project(g.input).depletedAt !== null);
    expect(depleting.length).toBeGreaterThan(0);
    for (const g of depleting) {
      const pj = project(g.input);
      const year = pj.depletedAt?.year;
      expect(year).toBeDefined();
      // チャートは `rows` の中から同じ年を探して x 座標を決めるので、行に存在しないと描けない
      expect(pj.rows.some((r) => r.year === year)).toBe(true);
    }
  });

  it("**`ample` 世帯ではマーカーを出さない**（起きない事実の目印を全世帯に出さない）", () => {
    const ample = GOLDEN.filter((g) => diagnose(P, g.input, AS_OF).self.verdict === "ample");
    expect(ample.length).toBeGreaterThan(0);
    for (const g of ample) {
      expect(project(g.input).depletedAt).toBeNull();
    }
  });
});

/**
 * **撤去した「いちばん細い年」タイルの記録**（2026-09-21・`Vitals` 撤去）
 *
 * 旧「検査値パネル」の4枚目は `貯蓄が尽きる年 → いまの保障で足りる年 → いちばん細い年` の
 * 優先順で1枚だけ出していた。3番目の `いちばん細い年` は
 * **現保障が未入力で、かつ貯蓄が尽きない世帯**でしか出番が来ない。
 *
 * ゴールデン10世帯はすべて保障を答えているので、**実測で一度も発火しなかった**。
 * corpus に無い分岐を、撤去と同時に記録なしで消すと
 * 「そもそも出ていたのか」を後から確かめる手段が無くなるので、
 * **合成入力で発火条件を1本だけ固定して残す**
 * （`docs/算定テスト_10世帯.xlsx` には合成世帯を足さない。正本は実在的世帯のまま）。
 */
describe("撤去した「いちばん細い年」の発火条件（記録用・合成入力）", () => {
  it("現保障が未入力で、かつ貯蓄が尽きない世帯でだけ出番が来ていた", () => {
    const synthetic = {
      ...GOLDEN[0].input,
      // 発火条件①：現保障が未入力（`いまの保障で足りる年` が出せない）
      coverageSelf: null,
      // 発火条件②：貯蓄が尽きない（`貯蓄が尽きる年` に負けない）
      assets: 300_000_000,
    };
    const pj = projectDeath(P, toHousehold(synthetic, "self"), { asOfYear: 2026 });
    expect(pj.depletedAt).toBeNull();
    expect(synthetic.coverageSelf).toBeNull();
    // このとき出ていた値。年間収支が最小の年で、算定期間のなかにある
    expect(pj.tightest).not.toBeNull();
    expect(pj.rows.some((r) => r.year === pj.tightest?.year)).toBe(true);
    const minNet = Math.min(...pj.rows.map((r) => r.net));
    expect(pj.tightest?.net).toBe(minNet);
  });

  it("**ゴールデン10世帯では一度も発火しない**（全世帯が保障を答えているため）", () => {
    const fired = GOLDEN.filter(
      (g) => g.input.coverageSelf === null && project(g.input).depletedAt === null,
    );
    expect(fired).toHaveLength(0);
  });
});
