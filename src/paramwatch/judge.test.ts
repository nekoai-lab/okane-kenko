/**
 * 影響の測り方の検査（フェーズ2b）。
 *
 * ここで守りたいのは「差分＝通知」にしないこと。**結論が変わらなければ静かにする。**
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { applyChanges, assessImpact } from "./judge.js";

const P = loadParams("2026-08");
const CASES = GOLDEN.map((g) => ({ id: g.id, label: g.label, input: g.input }));

describe("applyChanges", () => {
  it("候補値を載せた版を作り、元の版は変えない", () => {
    const before = P.public.izokuKisoBase.value;
    const next = applyChanges(P, [
      { key: "izokuKisoBase", label: "遺族基礎年金 基本額", current: before, proposed: 900000 },
    ]);
    expect(next.public.izokuKisoBase.value).toBe(900000);
    expect(P.public.izokuKisoBase.value).toBe(before); // 元は不変
  });

  it("params に無いキーは黙って足さない", () => {
    expect(() =>
      applyChanges(P, [{ key: "notAKey", label: "?", current: 0, proposed: 1 }]),
    ).toThrow();
  });
});

describe("assessImpact", () => {
  it("値が動かなければ、結論が変わる世帯は0件", () => {
    const v = P.public.izokuKisoBase.value;
    const r = assessImpact(
      P,
      [{ key: "izokuKisoBase", label: "遺族基礎年金 基本額", current: v, proposed: v }],
      CASES,
    );
    expect(r.changedCount).toBe(0);
    expect(r.households).toHaveLength(GOLDEN.length);
  });

  it("年金が大きく減れば、必要額は増える方向に動く", () => {
    const v = P.public.izokuKisoBase.value;
    const r = assessImpact(
      P,
      [{ key: "izokuKisoBase", label: "遺族基礎年金 基本額", current: v, proposed: 100000 }],
      CASES,
    );
    // 子のいる世帯は遺族基礎年金を受け取るので、減れば必要額は増える
    const withChildren = r.households.filter((h) => h.needAfter !== h.needBefore);
    expect(withChildren.length).toBeGreaterThan(0);
    for (const h of withChildren) expect(h.needAfter).toBeGreaterThan(h.needBefore);
  });

  it("**不変条件は、期待値との一致ではない。** 年金額が動いても内訳の整合は保たれる", () => {
    const v = P.public.izokuKisoBase.value;
    const r = assessImpact(
      P,
      [{ key: "izokuKisoBase", label: "遺族基礎年金 基本額", current: v, proposed: 950000 }],
      CASES,
    );
    // ゴールデンの期待値はいまのパラメータ版での検算なので、年金が動けばずれる。
    // それを不合格と呼ぶと正しい更新が永久に通らない。見るのは整合だけ。
    expect(r.invariantFailures).toEqual([]);
    expect(r.safe).toBe(true);
  });
});
