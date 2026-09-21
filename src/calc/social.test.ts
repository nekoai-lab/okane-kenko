/**
 * 制度式モジュールの検査（再設計フェーズ1・タスク1）
 *
 * 期待値は制度の式から手で出す。**実装の出力を写さない。**
 * 高額療養費は協会けんぽの計算例の形（上限＝base＋(医療費−threshold)×1%）に合わせている。
 */
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { kihonTeate, kogakuBurden, shobyoTeate } from "./social.js";

const P = loadParams("2026-08");

/** 区分ウ（年収370万〜770万）に落ちる年収 */
const INCOME_U = 6_000_000;

describe("kogakuBurden：高額療養費の月上限 × 月数", () => {
  it("3か月目までは通常の上限で積む（多数回該当はまだ効かない）", () => {
    // 区分ウ：85,800 +（1,000,000 − 286,000）× 1% = 92,940 円/月
    const r = kogakuBurden(P, INCOME_U, 3);
    expect(r.category).toBe("区分ウ");
    expect(r.monthlyCap).toBe(92_940);
    expect(r.amount).toBe(92_940 * 3);
    expect(r.assumptions.join()).not.toContain("多数回該当として上限が下がる");
  });

  /**
   * 仕様 §5.4 の「がんで1年休職」の医療費部分。
   * 3か月 × 92,940 ＋ 9か月 × 44,400 ＝ 678,420 円（約67万円）。
   * **多数回該当を入れないと 1,115,280 円（約112万円）になり、4割以上ずれる。**
   *
   * ⚠️ **このテストが固定しているのは「式の構造」であって、44,400 という値の正しさではない。**
   * 多数回該当の5値は従来区分の値で、上限テーブル側は 2026年8月の第1段階改定後。
   * **ア〜エの多数回該当が改定されているかは未確認**（仕様 §9 の一次情報確認タスク）。
   * 確認がついたら、**出典つきで期待値を張り直す**。そのときこのテストが守るのは
   * 「3か月は通常上限・4か月目から減額上限」という**切り替わりの形**のほうである。
   */
  it("12か月では4か月目から多数回該当に切り替わり、約67万円に落ちる", () => {
    const r = kogakuBurden(P, INCOME_U, 12);
    expect(r.reducedCap).toBe(44_400);
    expect(r.amount).toBe(92_940 * 3 + 44_400 * 9);
    expect(r.amount).toBeCloseTo(678_420, -3); // 約67万円
    // 多数回該当を入れなかった場合との差が、この実装の意味そのもの
    expect(r.amount).toBeLessThan(92_940 * 12);
    expect(r.assumptions.join()).toContain("多数回該当");
  });

  it("前提を黙って飲み込まない（簡約したことを必ず返す）", () => {
    const r = kogakuBurden(P, INCOME_U, 12);
    expect(r.assumptions.join()).toContain("連続して該当");
    expect(r.assumptions.join()).toContain("世帯合算");
  });

  it("0か月なら0円", () => {
    expect(kogakuBurden(P, INCOME_U, 0).amount).toBe(0);
  });

  it("所得区分が上がると上限も上がる", () => {
    const u = kogakuBurden(P, INCOME_U, 12);
    const a = kogakuBurden(P, 15_000_000, 12);
    expect(a.category).toBe("区分ア");
    expect(a.monthlyCap).toBeGreaterThan(u.monthlyCap);
    expect(a.amount).toBeGreaterThan(u.amount);
  });
});

describe("shobyoTeate：傷病手当金", () => {
  it("標準報酬日額の3分の2 × 支給日数（待期3日は引く）", () => {
    // 年収600万 → 月50万 → 日額 16,666.67 → × 2/3 ＝ 11,111.67 円/日
    // 12か月＝360日から待期3日を引いて357日
    const r = shobyoTeate(P, { annualIncome: INCOME_U, months: 12, employment: "employee" });
    expect(r.dailyAmount).toBe(11_112);
    expect(r.paidDays).toBe(357);
    expect(r.amount).toBeCloseTo(3_966_865, -2);
  });

  it("通算1年6か月で打ち切る", () => {
    const r18 = shobyoTeate(P, { annualIncome: INCOME_U, months: 18, employment: "employee" });
    const r24 = shobyoTeate(P, { annualIncome: INCOME_U, months: 24, employment: "employee" });
    expect(r24.amount).toBe(r18.amount);
    expect(r24.assumptions.join()).toContain("打ち切られる");
  });

  it("**自営・フリーランスは0円**（国民健康保険に傷病手当金が無い）", () => {
    const r = shobyoTeate(P, { annualIncome: INCOME_U, months: 12, employment: "self" });
    expect(r.amount).toBe(0);
    expect(r.assumptions.join()).toContain("国民健康保険");
  });

  it("等級表を引いていないことを前提として残す", () => {
    const r = shobyoTeate(P, { annualIncome: INCOME_U, months: 6, employment: "employee" });
    expect(r.assumptions.join()).toContain("等級表");
  });
});

describe("kihonTeate：雇用保険 基本手当", () => {
  it("年齢別の日額上限で頭打ちになる", () => {
    // 年収600万 → 賃金日額 16,438 → ×0.6 ＝ 9,863 だが、40歳の上限 7,715 で頭打ち
    const r = kihonTeate(P, { annualIncome: INCOME_U, age: 40, insuredYears: 10 });
    expect(r.dailyAmount).toBe(7_715);
    expect(r.days).toBe(120); // 加入10年以上20年未満
    expect(r.amount).toBe(7_715 * 120);
    expect(r.assumptions.join()).toContain("頭打ち");
  });

  it("加入期間で給付日数が変わる", () => {
    const y1 = kihonTeate(P, { annualIncome: INCOME_U, age: 40, insuredYears: 1 });
    const y20 = kihonTeate(P, { annualIncome: INCOME_U, age: 40, insuredYears: 20 });
    expect(y1.days).toBe(90);
    expect(y20.days).toBe(150);
  });

  it("加入1年未満は見込まない", () => {
    const r = kihonTeate(P, { annualIncome: INCOME_U, age: 40, insuredYears: 0 });
    expect(r.amount).toBe(0);
    expect(r.assumptions.join()).toContain("1年未満");
  });

  it("上限に当たらない収入では給付率がそのまま効く", () => {
    // 年収300万 → 賃金日額 8,219 → ×0.6 ＝ 4,932（上限6,945/7,715 に当たらない）
    const r = kihonTeate(P, { annualIncome: 3_000_000, age: 40, insuredYears: 10 });
    expect(r.dailyAmount).toBe(4_932);
    expect(r.assumptions.join()).not.toContain("頭打ち");
  });

  it("会社都合の表を使っていないことを前提として残す", () => {
    const r = kihonTeate(P, { annualIncome: INCOME_U, age: 40, insuredYears: 10 });
    expect(r.assumptions.join()).toContain("会社都合");
  });
});
