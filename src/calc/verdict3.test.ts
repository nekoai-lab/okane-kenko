/**
 * 判定3値と世帯集約の検査（再設計フェーズ1・タスク4）
 *
 * **実装より先に書いている。** 期待値は仕様 `docs/redesign-spec-2026-09-21.md` §1 から来る。
 *
 * **判定（規則）の正本は §1 であり、このテストが規則を固定する**（ADR-021）。
 * `docs/算定テスト_10世帯.xlsx` は**金額（事実）の正本**で、判定は書き込まない。
 * 実際の10世帯での導出は `docs/verdict3-derivation-2026-09-21.md` に残してある。
 *
 * ここで守りたいこと：
 * - **境界を固定する。** 端ちょうどがどちらに倒れるかを決め打つ
 * - **個人の3値と世帯の4値を混ぜない。** 集約は世帯の言い方を決めるだけで、個人の事実を上書きしない
 * - **合成世帯は xlsx に足さない。** 正本は実在的世帯のまま保ち、境界は単体テストで見る
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { diagnose } from "./index.js";
import {
  type HouseholdVerdict,
  type Verdict3,
  aggregateHousehold,
  householdSummary,
  verdict3,
  verdictBySavings,
} from "./verdict3.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

/** 万円で書いて円に直す（正本の表記に合わせる） */
const man = (n: number) => n * 10_000;

describe("verdict3：個人の判定（3値）", () => {
  it("現保障がレンジ上端を上回るなら『減らせる可能性』", () => {
    expect(verdict3(man(3000), man(200), man(200))).toBe("reducible");
    expect(verdict3(man(2000), man(500), man(800))).toBe("reducible");
  });

  it("現保障がレンジ下端を下回るなら『不足の可能性』", () => {
    expect(verdict3(man(1000), man(2000), man(3000))).toBe("shortage");
    expect(verdict3(man(0), man(200), man(200))).toBe("shortage");
  });

  it("レンジの中なら『圏内・要精査』── 言い切らない", () => {
    // GT-08 本人：400–600万に対して現保障500万
    expect(verdict3(man(500), man(400), man(600))).toBe("uncertain");
  });

  /**
   * **不等号は厳密（仕様 §1）。** 端ちょうどは両方とも『圏内・要精査』に入る。
   *
   * なぜ上端ちょうどを「減らせる」にしないか：
   * **減額できる幅が0円だから。** 「減らせます」と言いながら減らせる額が0円なのは空主張で、
   * ナイフエッジで減額を誘うことになる。「言い切らない」「安全側に倒す」という原則に反する。
   */
  it("境界①：現保障＝レンジ上端ちょうど → 『圏内・要精査』（減額幅が0円）", () => {
    expect(verdict3(man(600), man(400), man(600))).toBe("uncertain");
  });

  it("境界②：現保障＝レンジ下端ちょうど → 『圏内・要精査』（届かなくはない）", () => {
    expect(verdict3(man(400), man(400), man(600))).toBe("uncertain");
  });

  it("レンジが1点のとき（low === high）も、端ちょうどは圏内", () => {
    expect(verdict3(man(200), man(200), man(200))).toBe("uncertain");
    expect(verdict3(man(201), man(200), man(200))).toBe("reducible");
    expect(verdict3(man(199), man(200), man(200))).toBe("shortage");
  });

  it("現保障が不明なら判定しない（過不足を断定しない）", () => {
    expect(verdict3(null, man(200), man(200))).toBe("pending");
  });
});

describe("aggregateHousehold：世帯の判定（4値）", () => {
  it("全員が『減らせる』なら世帯も『減らせる可能性』", () => {
    expect(aggregateHousehold(["reducible", "reducible"])).toBe("reducible");
    expect(aggregateHousehold(["reducible"])).toBe("reducible"); // 単身
  });

  /** GT-01：本人は減らせる・配偶者は不足。**総量は足りているが配分がずれている** */
  it("『不足』と『減らせる』が同居したら『組み替えの余地』", () => {
    expect(aggregateHousehold(["reducible", "shortage"])).toBe("rebalanceable");
    expect(aggregateHousehold(["shortage", "reducible"])).toBe("rebalanceable");
  });

  it("『不足』がいて『減らせる』がいなければ『不足の可能性』", () => {
    expect(aggregateHousehold(["shortage", "shortage"])).toBe("shortage");
    // GT-08：圏内 ＋ 不足
    expect(aggregateHousehold(["uncertain", "shortage"])).toBe("shortage");
  });

  it("それ以外（圏内を含む混在・不足なし）は『圏内・要精査』", () => {
    expect(aggregateHousehold(["uncertain", "uncertain"])).toBe("uncertain");
    expect(aggregateHousehold(["reducible", "uncertain"])).toBe("uncertain");
  });

  it("判定していない人（pending）は集約に数えない", () => {
    expect(aggregateHousehold(["reducible", "pending"])).toBe("reducible");
    expect(aggregateHousehold(["pending"])).toBe("pending");
  });
});

/**
 * 現行4値からの写像（仕様 §1）。**世帯レベルの期待値が動かないことの担保。**
 * `all_covered` だけは corpus に該当世帯が無く正本では固定できないので、ここで合成入力で1件だけ見る
 * （`docs/算定テスト_10世帯.xlsx` に合成世帯は足さない）。
 */
describe("現行4値との写像", () => {
  it("reducible → 減らせる可能性", () => {
    expect(aggregateHousehold(["reducible", "reducible"])).toBe("reducible");
  });

  it("shortage → 不足の可能性", () => {
    expect(aggregateHousehold(["shortage", "shortage"])).toBe("shortage");
  });

  it("rebalanceable → 組み替えの余地", () => {
    expect(aggregateHousehold(["reducible", "shortage"])).toBe("rebalanceable");
  });

  /**
   * `all_covered`（全員カバー済みで余剰あり）は、新3値では**減らせる側の事実**。
   * corpus に該当世帯が無いため、**ここが唯一の固定点**になる（xlsx には合成世帯を足さない）。
   */
  it("all_covered → 減らせる可能性（合成入力・corpus に該当世帯が無い）", () => {
    // 余剰が大きい＝現保障がレンジ上端を大きく上回る、が全員で成り立つ形
    const self = verdict3(man(5000), man(200), man(200));
    const spouse = verdict3(man(3000), man(200), man(200));
    expect(self).toBe("reducible");
    expect(spouse).toBe("reducible");
    expect(aggregateHousehold([self, spouse])).toBe("reducible");
  });
});

/**
 * 実在10世帯での当てはめ。**導出記録 `docs/verdict3-derivation-2026-09-21.md` と一致することを固定する。**
 *
 * ここが落ちたら、**パラメータ版が変わって必要額レンジが動いた**ということ。
 * そのときは導出記録を更新日つきで書き直す（xlsx 側に判定列を作って二重管理しない・ADR-021）。
 */
describe("実在10世帯：導出記録との一致", () => {
  const EXPECTED: Record<string, { self: Verdict3; spouse?: Verdict3; household: HouseholdVerdict }> =
    {
      "GT-01": { self: "reducible", spouse: "shortage", household: "rebalanceable" },
      "GT-02": { self: "shortage", spouse: "shortage", household: "shortage" },
      "GT-03": { self: "reducible", spouse: "reducible", household: "reducible" },
      "GT-04": { self: "reducible", spouse: "reducible", household: "reducible" },
      "GT-05": { self: "reducible", household: "reducible" },
      "GT-06": { self: "shortage", spouse: "shortage", household: "shortage" },
      "GT-07": { self: "reducible", spouse: "reducible", household: "reducible" },
      "GT-08": { self: "uncertain", spouse: "shortage", household: "shortage" },
      "GT-09": { self: "reducible", spouse: "reducible", household: "reducible" },
      "GT-10": { self: "reducible", spouse: "reducible", household: "reducible" },
    };

  it.each(GOLDEN.map((g) => [g.id, g] as const))("%s", (id, g) => {
    const r = diagnose(P, g.input, AS_OF);
    const e = EXPECTED[id];
    const self = verdict3(g.input.coverageSelf, r.self.range.low, r.self.range.high);
    expect(self).toBe(e.self);

    const vs: Verdict3[] = [self];
    if (r.spouse) {
      const sp = verdict3(g.input.coverageSpouse, r.spouse.range.low, r.spouse.range.high);
      expect(sp).toBe(e.spouse);
      vs.push(sp);
    }
    expect(aggregateHousehold(vs)).toBe(e.household);
  });

  /** 端ちょうどが1件も無いこと（＝厳密不等号への裁定が19セルを動かさなかったことの担保） */
  it("実在世帯に『端ちょうど』は1件も無い", () => {
    for (const g of GOLDEN) {
      const r = diagnose(P, g.input, AS_OF);
      const at = (cov: number | null | undefined, lo: number, hi: number) =>
        cov !== null && cov !== undefined && (cov === lo || cov === hi);
      expect(at(g.input.coverageSelf, r.self.range.low, r.self.range.high)).toBe(false);
      if (r.spouse) {
        expect(at(g.input.coverageSpouse, r.spouse.range.low, r.spouse.range.high)).toBe(false);
      }
    }
  });
});

/**
 * 貯蓄軸の判定（病気・けが・失業の行）。仕様 §1。
 * **死亡側と同じ3値を使い、比較対象だけ替える。**
 */
describe("verdictBySavings：貯蓄という受け皿で足りるか", () => {
  it("貯蓄の下端が必要額の上端を上回れば『大丈夫のめやす』", () => {
    expect(verdictBySavings(man(500), man(1000), man(28), man(77))).toBe("reducible");
  });

  it("貯蓄の上端が必要額の下端に届かなければ『備え不足の可能性』", () => {
    expect(verdictBySavings(man(0), man(50), man(100), man(300))).toBe("shortage");
  });

  it("幅が重なっていれば『圏内・要精査』── 言い切らない", () => {
    expect(verdictBySavings(man(50), man(200), man(100), man(300))).toBe("uncertain");
  });

  /**
   * **不等号は厳密。両端は圏内。** 死亡側と同じ理由で、ナイフエッジで「大丈夫」と言わない。
   */
  it("境界①：貯蓄の下端＝必要額の上端ちょうど → 圏内", () => {
    expect(verdictBySavings(man(77), man(1000), man(28), man(77))).toBe("uncertain");
  });

  it("境界②：貯蓄の上端＝必要額の下端ちょうど → 圏内", () => {
    expect(verdictBySavings(man(0), man(100), man(100), man(300))).toBe("uncertain");
  });

  it("**貯蓄を点で比べると幅の情報が消える**（下端と上端が同じなら死亡側と同じ形になる）", () => {
    // 点＝幅ゼロ。必要額の幅の中に入れば圏内
    expect(verdictBySavings(man(200), man(200), man(100), man(300))).toBe("uncertain");
    expect(verdictBySavings(man(400), man(400), man(100), man(300))).toBe("reducible");
  });
});

/**
 * ヒーローの見出しは「判定」と「差額」を同時に出す。
 * **この2つが別の規則から出ていると、見出しが自分の根拠と食い違う。**
 * 既存の `headline()` は `gap`（`coverage > high * 1.5` で過剰）由来なので、
 * 判定と差額の出どころを `verdict3` に揃えたことをここで固定する。
 */
describe("householdSummary：世帯4値と差額を同じ規則から出す", () => {
  it("全員が減らせるなら世帯も減らせる。差額は coverage − needHigh の合計", () => {
    const r = householdSummary([
      { coverage: man(3000), needLow: man(200), needHigh: man(200) },
      { coverage: man(500), needLow: man(200), needHigh: man(200) },
    ]);
    expect(r.verdict).toBe("reducible");
    expect(r.totalReducible).toBe(man(2800) + man(300));
    expect(r.totalShortage).toBe(0);
    expect(r.totalCoverage).toBe(man(3500));
    expect(r.totalNeed).toEqual({ low: man(400), high: man(400) });
  });

  it("不足と減らせるが同居したら『組み替えの余地』。両方の差額が出る", () => {
    const r = householdSummary([
      { coverage: man(3000), needLow: man(1000), needHigh: man(2000) },
      { coverage: man(0), needLow: man(200), needHigh: man(400) },
    ]);
    expect(r.verdict).toBe("rebalanceable");
    expect(r.totalReducible).toBe(man(1000));
    expect(r.totalShortage).toBe(man(200));
  });

  it("**上端ちょうどは減らせるに入れない。** 差額0円の空主張を作らない", () => {
    const r = householdSummary([{ coverage: man(2000), needLow: man(1000), needHigh: man(2000) }]);
    expect(r.verdict).toBe("uncertain");
    expect(r.totalReducible).toBe(0);
  });

  it("現保障が未入力の人は数に入れない（分からないことを世帯の結論に混ぜない）", () => {
    const r = householdSummary([
      { coverage: null, needLow: man(1000), needHigh: man(2000) },
      { coverage: man(0), needLow: man(200), needHigh: man(400) },
    ]);
    expect(r.verdict).toBe("shortage");
    expect(r.totalShortage).toBe(man(200));
    expect(r.totalReducible).toBe(0);
    // **1人でも未入力なら世帯合計は出さない。** 欠けたまま足すと実際より小さい保障額になる
    expect(r.totalCoverage).toBeNull();
  });

  it("全員が未入力なら世帯も pending。差額は出さない", () => {
    const r = householdSummary([{ coverage: null, needLow: man(1000), needHigh: man(2000) }]);
    expect(r.verdict).toBe("pending");
    expect(r.totalReducible).toBe(0);
    expect(r.totalShortage).toBe(0);
  });
});
