/**
 * 金額の表示フォーマット。
 *
 * **ここが守るのは「読めること」**。金額そのものは `src/calc` が作っていて正しいのに、
 * 表示が `17,689万円` だと、読み手は桁を数えないと意味が取れない。
 * 2026-09-21、配偶者死亡ケースの前提開示で実際にこの表示が出た。
 */
import { describe, expect, it } from "vitest";
import { formatMan, formatRange } from "./tokens.js";

const man = (n: number) => n * 10_000;

describe("formatMan", () => {
  it("1億未満はそのまま万円で出す", () => {
    expect(formatMan(man(200))).toBe("200万円");
    expect(formatMan(man(3000))).toBe("3,000万円");
    expect(formatMan(man(9999))).toBe("9,999万円");
  });

  it("**1億以上は億で折る**（桁を数えさせない）", () => {
    expect(formatMan(man(10_000))).toBe("1億円");
    expect(formatMan(man(14_000))).toBe("1億4,000万円");
    expect(formatMan(man(17_689))).toBe("1億7,689万円");
  });

  it("端数が無いときは「◯億円」で止める（0万円を書かない）", () => {
    expect(formatMan(man(20_000))).toBe("2億円");
  });

  it("0 と負の値でも単位を落とさない", () => {
    expect(formatMan(0)).toBe("0万円");
    expect(formatMan(-man(500))).toBe("-500万円");
    expect(formatMan(-man(12_345))).toBe("-1億2,345万円");
  });
});

describe("formatRange", () => {
  it("点のときは「約◯」だけにする（幅が無いのに幅を装わない）", () => {
    expect(formatRange(man(200), man(200))).toBe("約200万円");
  });

  it("幅があるときは下端に単位を付けない", () => {
    expect(formatRange(man(2600), man(3400))).toBe("約2,600〜3,400万円");
  });

  it("**下端と上端で単位が変わるときは、下端にも単位を残す**", () => {
    // 「約8,000〜1億2,000万円」。下端を裸にすると 8,000 が億の一部に読める
    expect(formatRange(man(8000), man(12_000))).toBe("約8,000万〜1億2,000万円");
  });
});
