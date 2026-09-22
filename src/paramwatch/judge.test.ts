/**
 * 影響の測り方の検査（フェーズ2b）。
 *
 * ここで守りたいのは「差分＝通知」にしないこと。**結論が変わらなければ静かにする。**
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { PRE_TG } from "./__fixtures__/preTg.js";
import { applyChanges, assessImpact, summarizeRows } from "./judge.js";

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

/**
 * **D2 の受け入れ検算**（2026-09-22・キックオフ v2）。
 *
 * T-G（給付制限 2→1 か月）の影響を、**エージェント自身の実行**で出す。
 * 期待値は `statutory.snapshot.test.ts` の T-G todo に先に書いてあるもの
 * （「needHigh が 20.0〜40.0万円 下がる。needLow と過不足の判定は動かない」）。
 */
describe("assessImpact：死亡＋statutory 3行を軸名つきで比べる（D2）", () => {
  const AS_OF = new Date("2026-09-22T00:00:00+09:00");
  const WITH_EXPECT = GOLDEN.map((g) => ({
    id: g.id,
    label: g.label,
    input: g.input,
    expect: g.expect,
  }));
  const TG = [
    {
      key: "kihonTeate.restrictionMonthsVoluntary",
      label: "自己都合退職の給付制限（原則）",
      current: 2,
      proposed: 1,
      unit: "か月",
    },
  ];
  /**
   * **2→1 を測る土台は、改正前の凍結コピー**（2026-09-23）。
   * T-G は本物の params に適用済みなので、生きた params を土台にすると
   * before も after も 1 か月になり、**測るべき差が消える**（テストは緑のまま無意味になる）。
   */
  const BASE = PRE_TG;

  it("T-G：失業の needHigh が全10世帯で 20.0〜40.0万円 下がり、needLow と過不足の判定は動かない", () => {
    const r = assessImpact(BASE, TG, WITH_EXPECT, AS_OF);
    for (const h of r.households) {
      const u = h.rows?.find((x) => x.scenario === "unemployment");
      if (!u) throw new Error(h.id);
      const drop = u.needBefore.high - u.needAfter.high;
      expect(drop).toBeGreaterThanOrEqual(200_000);
      expect(drop).toBeLessThanOrEqual(400_000);
      expect(u.needAfter.low).toBe(u.needBefore.low);
      expect(u.verdictAfter).toBe(u.verdictBefore);
      // 失業以外の行は1円も動かない
      for (const other of (h.rows ?? []).filter((x) => x.scenario !== "unemployment")) {
        expect(other.needAfter).toEqual(other.needBefore);
        expect(other.verdictAfter).toBe(other.verdictBefore);
      }
    }
    expect(r.baselineFailures).toEqual([]);
    expect(r.safe).toBe(true);
  });

  it("報告は軸名つきで、失業の行に変化の幅と「過不足の判定が変わる世帯 0/10」が出る", () => {
    const lines = summarizeRows(assessImpact(BASE, TG, WITH_EXPECT, AS_OF));
    const u = lines.find((l) => l.startsWith("失業："));
    expect(u).toContain("必要額（ニーズ軸）が動く世帯 10/10");
    expect(u).toContain("needLow 変化なし");
    expect(u).toContain("過不足の判定（過不足軸）が変わる世帯 0/10");
    expect(lines.find((l) => l.startsWith("死亡："))).toContain(
      "必要額の判定（ニーズ軸）が変わる世帯 0/10",
    );
  });

  it("**現行 params で green でなければ、承認できない**（比べる土台が壊れている）", () => {
    const broken = WITH_EXPECT.map((c, i) =>
      i === 0 ? { ...c, expect: { ...c.expect, headline: "shortage" } } : c,
    );
    const r = assessImpact(P, TG, broken, AS_OF);
    expect(r.invariantFailures).toEqual([]);
    expect(r.baselineFailures?.[0]).toMatchObject({ id: "GT-01" });
    expect(r.safe).toBe(false);
  });

  it("結論が変わることは不合格ではない（影響レポートの中身であって、承認を止める理由ではない）", () => {
    // 遺族基礎年金を大きく下げると結論が変わる世帯が出るが、検算には通る
    const r = assessImpact(
      P,
      [
        {
          key: "izokuKisoBase",
          label: "基本額",
          current: P.public.izokuKisoBase.value,
          proposed: 0,
        },
      ],
      WITH_EXPECT,
      AS_OF,
    );
    expect(r.households.some((h) => h.rows?.some((x) => x.verdictBefore !== x.verdictAfter))).toBe(
      true,
    );
    expect(r.safe).toBe(true);
  });
});
