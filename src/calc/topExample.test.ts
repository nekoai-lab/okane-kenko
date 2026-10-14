/**
 * トップページの試算例。**LP の数字がエンジンの出力そのものである**ことを固定する。
 */
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { toCompleteSelections } from "../wizard/complete.js";
import { normalize } from "../wizard/normalize.js";
import { decodeSelections } from "../wizard/url.js";
import { diagnose } from "./index.js";
import { TOP_EXAMPLE_QUERY, topExample } from "./topExample.js";
import { verdict3 } from "./verdict3.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-10-15T12:00:00+09:00");

describe("topExample（トップの試算例）", () => {
  const ex = topExample(P, AS_OF);
  const complete = toCompleteSelections(decodeSelections(new URLSearchParams(TOP_EXAMPLE_QUERY)));
  if (!complete) throw new Error("入力が揃っていない");
  const { input } = normalize(P, complete, AS_OF);
  const r = diagnose(P, input, AS_OF).self;

  it("金額は結果画面と同じ diagnose の出力そのもの", () => {
    expect(ex.total).toBe(r.expense.total);
    expect(ex.pension).toBe(r.income.pensionBasic + r.income.pensionKosei + r.income.chukoreiKafu);
    expect(ex.survivorWork).toBe(r.income.survivorWork);
    expect(ex.assets).toBe(r.income.assets);
    expect(ex.need).toEqual(r.range);
    expect(ex.coverage).toBe(input.coverageSelf);
  });

  it("世帯は LP の説明どおり（37歳・配偶者35歳・子2歳・団信あり）", () => {
    expect(ex.selfAge).toBe(37);
    expect(ex.spouseAge).toBe(35);
    expect(ex.childAges).toEqual([2]);
    expect(ex.danshinCovered).toBe(true);
  });

  it("過不足は verdict3 と同じ判定で、差は幅で返す", () => {
    expect(ex.verdict).toBe(verdict3(ex.coverage, ex.need.low, ex.need.high));
    if (ex.verdict === "shortage") {
      expect(ex.gap).toEqual({ low: ex.need.low - ex.coverage, high: ex.need.high - ex.coverage });
    }
    expect(ex.gap === null || ex.gap.low <= ex.gap.high).toBe(true);
  });
});
