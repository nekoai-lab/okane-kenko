/**
 * アダプタの検査（再設計フェーズ1・タスク2）
 *
 * いちばん確かめたいのは2つ。
 * 1. **委譲が無傷であること** ─ `simulate(x, "death")` と `diagnose(x)` が全フィールドで一致する。
 *    アダプタ側で既定値を補ったり丸めたりすると、既存の経路と新しい経路で答えがズレる。
 *    「レンジだけ比べる」テストではそのズレを通してしまうので、**結果を丸ごと**比べる。
 * 2. **計算未対応が例外ではないこと** ─ 「空欄である」ことが結果として返り、
 *    金額が 0 ではなく null であること（0 だと「0円で足りる」と読める）。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { diagnose } from "./index.js";
import { type Scenario, simulate, simulateAll } from "./simulate.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

describe("simulate('death')：既存 diagnose への委譲", () => {
  it.each(GOLDEN.map((g) => [g.id, g] as const))(
    "%s ─ diagnose の出力と全フィールドが一致する",
    (_id, g) => {
      const direct = diagnose(P, g.input, AS_OF);
      const viaAdapter = simulate(P, { answers: g.input, asOf: AS_OF }, "death");
      // 丸ごと比べる。1フィールドでも加工していたらここで落ちる
      expect(viaAdapter.death).toEqual(direct);
    },
  );

  it("レンジと現保障を、加工せずそのまま載せている", () => {
    const g = GOLDEN[0];
    const direct = diagnose(P, g.input, AS_OF);
    const r = simulate(P, { answers: g.input, asOf: AS_OF }, "death");
    expect(r.amounts).toEqual({
      needLow: direct.self.range.low,
      needHigh: direct.self.range.high,
      currentCoverage: g.input.coverageSelf,
    });
  });

  it("既存エンジンが記録した推定を、前提として引き継ぐ", () => {
    // 団信が分からない世帯は assumptions が付く
    const g = GOLDEN.find((x) => x.input.housing.danshin === undefined) ?? GOLDEN[0];
    const direct = diagnose(P, g.input, AS_OF);
    const r = simulate(P, { answers: g.input, asOf: AS_OF }, "death");
    expect(r.assumptions).toEqual(direct.self.assumptions.map((a) => a.note));
  });

  it("status は ok、精度は calculated", () => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "death");
    expect(r.status).toBe("ok");
    expect(r.precision).toBe("calculated");
    expect(r.notSupported).toBeNull();
  });

  /**
   * 暮らし方の目盛り（D-02・ADR-022）。
   *
   * 2026-09-21 まで、ここは「渡しても結果を変えない（受け取るだけ）」を固定していた。
   * 目盛りを実装したので**その期待値は役目を終えた**が、
   * **既定（`asis` と未指定）が `diagnose` と1ビットも変わらないこと**は引き続き守る
   * ── ゴールデンの期待値が不変であることの根拠がこれなので、ここを緩めない。
   */
  it("既定（未指定＝いま通り）は diagnose と全フィールド一致する", () => {
    const base = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "death");
    const asis = simulate(
      P,
      { answers: GOLDEN[0].input, asOf: AS_OF, assumptions: { livingLevel: "asis" } },
      "death",
    );
    expect(asis.death).toEqual(base.death);
    expect(base.death).toEqual(diagnose(P, GOLDEN[0].input, AS_OF));
  });

  it("**目盛りを動かすと結果が変わる**（切り詰める < いま通り < ゆとり）", () => {
    const total = (level: "tight" | "asis" | "roomy") =>
      simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF, assumptions: { livingLevel: level } }, "death")
        .death?.self.expense.total ?? 0;
    expect(total("tight")).toBeLessThan(total("asis"));
    expect(total("asis")).toBeLessThan(total("roomy"));
  });
});

describe("計算未対応は正規の診断結果（いま空欄なのは障害だけ）", () => {
  it("障害 ─ 例外を投げずに not_supported を返す", () => {
    expect(() => simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "disability")).not.toThrow();
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "disability");
    expect(r.status).toBe("not_supported");
    expect(r.precision).toBe("not_supported");
  });

  it("障害 ─ **金額は 0 ではなく null**（0円で足りる、と読ませない）", () => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "disability");
    expect(r.amounts).toBeNull();
    expect(r.yearly).toBeNull();
  });

  it("障害 ─ 画面にそのまま出せる理由文を持つ", () => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "disability");
    expect(r.notSupported?.reason).toBe("not_implemented");
    expect(r.notSupported?.detail).toContain("根拠なく数字を置かないため");
  });
});

/**
 * 病気・けが・失業は**制度式で概算する**（仕様 §5.3）。
 * タスク1で作った3モジュール（高額療養費・傷病手当金・基本手当）がここで初めて使われる。
 */
describe("制度式で概算するシナリオ", () => {
  const statutory: Scenario[] = ["sick_short", "sick_long", "unemployment"];

  it.each(statutory)("%s ─ 計算できて、精度は statutory_estimate", (s) => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.status).toBe("ok");
    expect(r.precision).toBe("statutory_estimate");
    expect(r.notSupported).toBeNull();
  });

  it.each(statutory)("%s ─ 必要額を**レンジで**返す（点で潰さない）", (s) => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.amounts).not.toBeNull();
    expect(r.amounts!.needLow).toBeGreaterThanOrEqual(0);
    expect(r.amounts!.needHigh).toBeGreaterThan(r.amounts!.needLow);
  });

  it.each(statutory)("%s ─ 保険の額とは並べない（比較対象が貯蓄なので null）", (s) => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.amounts!.currentCoverage).toBeNull();
  });

  it.each(statutory)("%s ─ 簡約した前提を全部返す", (s) => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.assumptions.length).toBeGreaterThan(2);
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("長期休職は短期より必要額が大きい（期間が4倍）", () => {
    const short = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "sick_short");
    const long = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "sick_long");
    expect(long.amounts!.needHigh).toBeGreaterThan(short.amounts!.needHigh);
  });

  it("失業の幅は、離職理由の違いから作る（下端＝会社都合・上端＝自己都合）", () => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "unemployment");
    expect(r.assumptions.join()).toContain("会社都合");
    expect(r.assumptions.join()).toContain("給付制限");
  });

  it("雇用保険の加入年数は設問に無いので、推定したことを前提に残す", () => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "unemployment");
    expect(r.assumptions.join()).toContain("設問に無いため");
  });
});

describe("simulateAll：診断表の5行", () => {
  it("5行を返し、空欄は障害だけ", () => {
    const rows = simulateAll(P, { answers: GOLDEN[0].input, asOf: AS_OF });
    expect(rows.map((r) => r.scenario)).toEqual([
      "death",
      "sick_short",
      "sick_long",
      "disability",
      "unemployment",
    ]);
    // 計算できるのは4行。空欄は障害だけ（仕様 §5.3）
    expect(rows.filter((r) => r.status === "ok")).toHaveLength(4);
    expect(rows.filter((r) => r.precision === "not_supported")).toHaveLength(1);
    expect(rows.filter((r) => r.precision === "statutory_estimate")).toHaveLength(3);
    expect(rows.filter((r) => r.precision === "calculated")).toHaveLength(1);
  });
});

/**
 * モック（`docs/design-mock/result.html`）の段差とつき合わせる（仕様 §6 のサンプル世帯）。
 *
 * **金額は突き合わせない。** 仕様が「モック内の金額はすべてサンプル値」と明記しているため、
 * ここで固定すると、実装ではなくモックの飾りをテストすることになる。
 * 固定するのは**段差が起きる年・そのときの配偶者の年齢・何が起きたか**＝図の骨格。
 */
describe("段差チャートの骨格：モックのサンプル世帯と突き合わせる", () => {
  // 仕様 §6：40歳会社員／配偶者38歳パート／子8歳・5歳／持ち家ローン団信あり
  const ANSWERS = {
    self: { age: 40, income: 6_000_000, employment: "employee" as const },
    spouse: { age: 38, income: 1_000_000, employment: "employee" as const },
    children: [8, 5],
    housing: { type: "own" as const, loan: 25_000_000, danshin: true },
    assets: 7_500_000,
    monthlyLiving: 280_000,
    educationPlan: "public" as const,
    coverageSelf: 30_000_000,
    coverageSpouse: null,
  };
  const r = simulate(P, { answers: ANSWERS, asOf: AS_OF }, "death");
  const rows = r.yearly ?? [];
  /** 公的年金の月額（円） */
  const publicMonthly = (y: number) => {
    const row = rows.find((x) => x.year === y);
    if (!row) throw new Error(`${y}年の行が無い`);
    return (row.income.pensionBasic + row.income.pensionKosei + row.income.chukoreiKafu) / 12;
  };

  it("段差①は 2036年・配偶者48歳（モックと一致）", () => {
    expect(rows.find((x) => x.year === 2036)?.ages.survivor).toBe(48);
    expect(publicMonthly(2036)).toBeLessThan(publicMonthly(2035));
  });

  it("段差②は 2039年・配偶者51歳で、最大の崖（モックと一致）", () => {
    expect(rows.find((x) => x.year === 2039)?.ages.survivor).toBe(51);
    const drop1 = publicMonthly(2035) - publicMonthly(2036);
    const drop2 = publicMonthly(2038) - publicMonthly(2039);
    expect(drop2).toBeGreaterThan(drop1); // ②のほうが大きく落ちる＝「最大の崖」
  });

  it("2039年に『遺族基礎年金が終わる』と『中高齢寡婦加算が始まる』が同時に立つ", () => {
    const e = r.events?.find((x) => x.year === 2039);
    expect(e?.events).toContain("遺族基礎年金が終わる");
    expect(e?.events).toContain("中高齢寡婦加算が始まる");
  });

  it("公的年金の月額は段差ごとに下がり、途中で増えない", () => {
    for (let y = 2027; y <= 2039; y++) {
      expect(publicMonthly(y)).toBeLessThanOrEqual(publicMonthly(y - 1) + 1);
    }
  });

  it("大学費用と重なる帯が取れる（2039〜2043に教育費が残っている）", () => {
    const band = rows.filter((x) => x.year >= 2039 && x.year <= 2043);
    expect(band.some((x) => x.expense.education > 0)).toBe(true);
  });

  /**
   * **フェンスポストは矛盾ではない。**
   * データ行の終端 2052（64歳）＝最後に受け取る年。
   * チャートの軸ラベルやロードマップの 2053（65歳）＝境界。**両方正しい。**
   * だから終端の注記は「前年」と言わず、算定の終端として語りつつ65歳の節目も落とさない。
   */
  it("終端の注記が、64歳の行に並んでも嘘にならない", () => {
    const e = r.events?.find((x) => x.events.some((t) => t.startsWith("算定はここまで")));
    expect(e?.year).toBe(2052);
    const row = rows.find((x) => x.year === 2052);
    expect(row?.ages.survivor).toBe(64);
    const text = e?.events.find((t) => t.startsWith("算定はここまで")) ?? "";
    expect(text).toContain("配偶者64歳"); // その行の年齢と一致している
    expect(text).toContain("翌2053年"); // 65歳の節目も落としていない
    expect(text).toContain("老齢年金");
    expect(text).not.toContain("前年"); // 読者に1年足させない
  });
});
