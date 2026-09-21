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

  it("前提の目盛りを渡しても、いまは結果を変えない（受け取るだけ）", () => {
    const base = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "death");
    const roomy = simulate(
      P,
      { answers: GOLDEN[0].input, asOf: AS_OF, assumptions: { livingLevel: "roomy" } },
      "death",
    );
    expect(roomy.death).toEqual(base.death);
  });
});

describe("未実装シナリオ：計算未対応は正規の診断結果", () => {
  const pending: Scenario[] = ["sick_short", "sick_long", "disability", "unemployment"];

  it.each(pending)("%s ─ 例外を投げずに not_supported を返す", (s) => {
    expect(() => simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s)).not.toThrow();
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.status).toBe("not_supported");
    expect(r.precision).toBe("not_supported");
  });

  it.each(pending)("%s ─ **金額は 0 ではなく null**（0円で足りる、と読ませない）", (s) => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.amounts).toBeNull();
    expect(r.yearly).toBeNull();
  });

  it.each(pending)("%s ─ 画面にそのまま出せる理由文を持つ", (s) => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, s);
    expect(r.notSupported?.reason).toBe("not_implemented");
    expect(r.notSupported?.detail.length ?? 0).toBeGreaterThan(10);
  });

  it("失業は「まだ計算していない」ではなく「保険で備える領域ではない」と言う", () => {
    const r = simulate(P, { answers: GOLDEN[0].input, asOf: AS_OF }, "unemployment");
    expect(r.notSupported?.detail).toContain("保険で備える領域ではない");
  });
});

describe("simulateAll：診断表の5行", () => {
  it("5行を返し、いま計算できるのは death だけ", () => {
    const rows = simulateAll(P, { answers: GOLDEN[0].input, asOf: AS_OF });
    expect(rows.map((r) => r.scenario)).toEqual([
      "death",
      "sick_short",
      "sick_long",
      "disability",
      "unemployment",
    ]);
    expect(rows.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(rows.filter((r) => r.precision === "not_supported")).toHaveLength(4);
  });
});
