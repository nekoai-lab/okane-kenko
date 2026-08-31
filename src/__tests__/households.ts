import type { DiagnoseInput } from "../calc/index.js";

const MAN = 10_000;

export interface GoldenCase {
  id: string;
  label: string;
  note: string;
  input: DiagnoseInput;
  expect: {
    self: { verdict: string; low: number; high: number; gap: string; gapAmount: number };
    spouse?: { verdict: string; low: number; high: number; gap: string; gapAmount: number };
    medical: string;
    reform2028: boolean;
    headline: string;
  };
}

/**
 * ゴールデンテスト用の10世帯（19の死亡ケース）。
 * 期待値は 2026-08-17 の検算（算定テスト_10世帯.xlsx）に一致させる。
 * パラメータを更新したら、このテストの差分を必ず記録すること（PR-06）。
 * 単位は万円で書き、比較時に円へ換算する。
 */
export const GOLDEN: GoldenCase[] = [
  {
    id: "GT-01",
    label: "夫37(500万)/妻35(250万)/子2歳/持家・団信あり/貯蓄400万",
    note: "事業計画のサンプル診断と照合するケース",
    input: {
      self: { age: 37, income: 500 * MAN, employment: "employee" },
      spouse: { age: 35, income: 250 * MAN, employment: "employee" },
      children: [2],
      housing: { type: "own", loan: 2500 * MAN, danshin: true },
      assets: 400 * MAN,
      monthlyLiving: 30 * MAN,
      educationPlan: "public",
      coverageSelf: 2000 * MAN,
      coverageSpouse: 0,
    },
    expect: {
      self: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 1800 },
      spouse: { verdict: "ample", low: 200, high: 200, gap: "shortage", gapAmount: 200 },
      medical: "self_insurable",
      reform2028: false,
      headline: "rebalanceable",
    },
  },
  {
    id: "GT-02",
    label: "夫38(500万)/妻35 専業/子5歳・2歳/賃貸/貯蓄200万",
    note: "本命ペルソナ 30代片働き・子あり。ターゲット表 2,000〜4,000万と照合",
    input: {
      self: { age: 38, income: 500 * MAN, employment: "employee" },
      spouse: { age: 35, income: 0, employment: "none" },
      children: [5, 2],
      housing: { type: "rent" },
      assets: 200 * MAN,
      monthlyLiving: 28 * MAN,
      educationPlan: "public",
      coverageSelf: 1000 * MAN,
      coverageSpouse: 0,
    },
    expect: {
      self: { verdict: "shortage", low: 2500, high: 3800, gap: "shortage", gapAmount: 1500 }, // 老後込み(暫定)
      spouse: { verdict: "ample", low: 200, high: 200, gap: "shortage", gapAmount: 200 },
      medical: "self_insurable",
      reform2028: false,
      headline: "shortage",
    },
  },
  {
    id: "GT-03",
    label: "夫40(700万)/妻38(400万)/子10歳・7歳/持家・団信あり/貯蓄600万",
    note: "40代共働き・教育費前。事業計画では『足りない○』だが結果は『減らせる』",
    input: {
      self: { age: 40, income: 700 * MAN, employment: "employee" },
      spouse: { age: 38, income: 400 * MAN, employment: "employee" },
      children: [10, 7],
      housing: { type: "own", loan: 2000 * MAN, danshin: true },
      assets: 600 * MAN,
      monthlyLiving: 35 * MAN,
      educationPlan: "public",
      coverageSelf: 1500 * MAN,
      coverageSpouse: 500 * MAN,
    },
    expect: {
      self: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 1300 },
      spouse: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 300 },
      medical: "self_insurable",
      reform2028: false,
      headline: "reducible",
    },
  },
  {
    id: "GT-04",
    label: "夫32(450万)/妻30(400万)/子なし/賃貸/貯蓄300万",
    note: "DINKs。2028年改正の唯一の直撃層。中高齢寡婦加算は年齢要件を満たさず0になること",
    input: {
      self: { age: 32, income: 450 * MAN, employment: "employee" },
      spouse: { age: 30, income: 400 * MAN, employment: "employee" },
      children: [],
      housing: { type: "rent" },
      assets: 300 * MAN,
      monthlyLiving: 25 * MAN,
      educationPlan: "public",
      coverageSelf: 1000 * MAN,
      coverageSpouse: 1000 * MAN,
    },
    expect: {
      self: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 800 },
      spouse: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 800 },
      medical: "self_insurable",
      reform2028: true,
      headline: "reducible",
    },
  },
  {
    id: "GT-05",
    label: "独身35(500万)/貯蓄300万",
    note: "扶養家族なし。上乗せを提示せず『保障は要りません』と言い切ること",
    input: {
      self: { age: 35, income: 500 * MAN, employment: "employee" },
      spouse: null,
      children: [],
      housing: { type: "rent" },
      assets: 300 * MAN,
      monthlyLiving: 20 * MAN,
      educationPlan: "public",
      coverageSelf: 1000 * MAN,
    },
    expect: {
      self: { verdict: "not_needed", low: 200, high: 200, gap: "excess", gapAmount: 800 },
      medical: "self_insurable",
      reform2028: true,
      headline: "reducible",
    },
  },
  {
    id: "GT-06",
    label: "自営45(600万)/妻43 専業/子12歳/持家・団信あり/貯蓄500万",
    note: "自営＝遺族厚生年金なし。会社員版より必要額が大きくなること",
    input: {
      self: { age: 45, income: 600 * MAN, employment: "self" },
      spouse: { age: 43, income: 0, employment: "none" },
      children: [12],
      housing: { type: "own", loan: 1500 * MAN, danshin: true },
      assets: 500 * MAN,
      monthlyLiving: 30 * MAN,
      educationPlan: "public",
      coverageSelf: 1000 * MAN,
      coverageSpouse: 0,
    },
    expect: {
      self: { verdict: "shortage", low: 2200, high: 3300, gap: "shortage", gapAmount: 1200 }, // 老後込み(暫定)
      spouse: { verdict: "ample", low: 200, high: 200, gap: "shortage", gapAmount: 200 },
      medical: "self_insurable",
      reform2028: false,
      headline: "shortage",
    },
  },
  {
    id: "GT-07",
    label: "夫45(800万)/妻43(300万)/子15歳・12歳/持家ローン1500万・団信なし/貯蓄800万",
    note: "団信なし。住居費が必要額に丸ごと乗ること",
    input: {
      self: { age: 45, income: 800 * MAN, employment: "employee" },
      spouse: { age: 43, income: 300 * MAN, employment: "employee" },
      children: [15, 12],
      housing: { type: "own", loan: 1500 * MAN, danshin: false },
      assets: 800 * MAN,
      monthlyLiving: 38 * MAN,
      educationPlan: "public",
      coverageSelf: 2000 * MAN,
      coverageSpouse: 500 * MAN,
    },
    expect: {
      self: { verdict: "sufficient", low: 500, high: 800, gap: "excess", gapAmount: 1200 },
      spouse: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 300 },
      medical: "self_insurable",
      reform2028: false,
      headline: "reducible",
    },
  },
  {
    id: "GT-08",
    label: "夫35(400万)/妻33 パート100万/子3歳/賃貸/貯蓄100万",
    note: "低収入・薄い貯蓄。直感に反して充足になる。n1でこの条件に近い世帯の反応を必ず見ること",
    input: {
      self: { age: 35, income: 400 * MAN, employment: "employee" },
      spouse: { age: 33, income: 100 * MAN, employment: "employee" },
      children: [3],
      housing: { type: "rent" },
      assets: 100 * MAN,
      monthlyLiving: 24 * MAN,
      educationPlan: "public",
      coverageSelf: 500 * MAN,
      coverageSpouse: 0,
    },
    expect: {
      self: { verdict: "shortage", low: 300, high: 500, gap: "adequate", gapAmount: 0 }, // 老後込み(暫定・sufficient→shortage反転)
      spouse: { verdict: "ample", low: 200, high: 200, gap: "shortage", gapAmount: 200 },
      medical: "partial",
      reform2028: false,
      headline: "shortage",
    },
  },
  {
    id: "GT-09",
    label: "夫50(1200万)/妻48(600万)/子20歳/持家ローンなし/貯蓄2000万",
    note: "高所得・高額療養費 区分ア。余剰が大きく『上乗せも不要』になること",
    input: {
      self: { age: 50, income: 1200 * MAN, employment: "employee" },
      spouse: { age: 48, income: 600 * MAN, employment: "employee" },
      children: [20],
      housing: { type: "own", loan: 0, danshin: true },
      assets: 2000 * MAN,
      monthlyLiving: 40 * MAN,
      educationPlan: "private",
      coverageSelf: 3000 * MAN,
      coverageSpouse: 1000 * MAN,
    },
    expect: {
      self: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 2800 },
      spouse: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 800 },
      medical: "self_insurable",
      reform2028: false,
      headline: "reducible",
    },
  },
  {
    id: "GT-10",
    label: "夫38(300万)/妻36(700万)/子6歳/持家・団信あり/貯蓄400万",
    note: "妻が主稼得者。世帯単位で見ないと配偶者側の過不足が見えないケース",
    input: {
      self: { age: 38, income: 300 * MAN, employment: "employee" },
      spouse: { age: 36, income: 700 * MAN, employment: "employee" },
      children: [6],
      housing: { type: "own", loan: 2500 * MAN, danshin: true },
      assets: 400 * MAN,
      monthlyLiving: 32 * MAN,
      educationPlan: "public",
      coverageSelf: 1000 * MAN,
      coverageSpouse: 500 * MAN,
    },
    expect: {
      self: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 800 },
      spouse: { verdict: "ample", low: 200, high: 200, gap: "excess", gapAmount: 300 },
      medical: "self_insurable",
      reform2028: false,
      headline: "reducible",
    },
  },
];
