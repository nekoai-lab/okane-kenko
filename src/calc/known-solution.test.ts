/**
 * 既知解との照合（再設計フェーズ1・タスク5／仕様 §7-2）
 *
 * 出典：日本年金機構「遺族年金ガイド 令和8年度版」
 * https://www.nenkin.go.jp/service/pamphlet/kyufu.files/LK03-3.pdf （2026-09-21 取得）
 *
 * **式と値を分けて見る。**
 * - 公式の値を差し込んだときに式が一致するか → 式の検査
 * - いまの `params` が公式値とどれだけ違うか → 値の検査
 *
 * これを分けないと、ズレたときに「式が違うのか、値が古いのか」が切り分けられない。
 * 実際いまは**値だけがズレていて式は合っている**ので、直すべきは params のほうだと分かる。
 */
import { describe, expect, it } from "vitest";
import type { ParamSet } from "../params/index.js";
import { loadParams } from "../params/index.js";
import { chukoreiKafuAnnual, izokuKisoAnnual, izokuKoseiAnnual } from "./pension.js";

const P = loadParams("2026-08");

/** 公式ガイド（令和8年度）に印刷されている値 */
const OFFICIAL = {
  izokuKisoBase: 847_300,
  childAdd1_2: 243_800,
  childAdd3plus: 81_300,
  chukoreiKafuAdd: 635_500,
  /** 平成15年4月以降の乗率 5.481/1000 */
  hoshuHireiCoef: 0.005481,
  /** 被保険者期間が300月未満なら300月とみなす */
  minimumInsuredMonths: 300,
  /** 報酬比例部分の 3/4 */
  izokuKoseiRatio: 0.75,
} as const;

/** 公式値を差し込んだ ParamSet（元は変えない） */
function withOfficial(): ParamSet {
  const q = structuredClone(P);
  for (const [k, v] of Object.entries(OFFICIAL)) {
    if (q.public[k]) q.public[k].value = v;
  }
  return q;
}

describe("式の検査：公式値を入れたら公式どおりの額になるか", () => {
  const O = withOfficial();

  it("遺族基礎年金（子2人）＝ 847,300 ＋ 243,800 × 2", () => {
    expect(izokuKisoAnnual(O, [8, 5])).toBe(847_300 + 243_800 * 2);
  });

  it("遺族基礎年金（子3人）＝ 847,300 ＋ 243,800 × 2 ＋ 81,300", () => {
    expect(izokuKisoAnnual(O, [10, 7, 3])).toBe(847_300 + 243_800 * 2 + 81_300);
  });

  it("18歳以上の子は数えない（末子18歳年度末で終了）", () => {
    expect(izokuKisoAnnual(O, [18, 5])).toBe(847_300 + 243_800);
    expect(izokuKisoAnnual(O, [18, 18])).toBe(0);
  });

  /**
   * 遺族厚生年金 ＝ 平均標準報酬額 × 5.481/1000 × 300月（みなし）× 3/4
   * 年収600万 → 平均標準報酬額 50万/月 とした場合：
   * 500,000 × 0.005481 × 300 × 0.75 = 616,612.5 円
   */
  it("遺族厚生年金 ＝ 平均標準報酬額 × 5.481/1000 × 300月 × 3/4", () => {
    const deceased = { age: 40, income: 6_000_000, employment: "employee" as const };
    const expected = (6_000_000 / 12) * 0.005481 * 300 * 0.75;
    expect(izokuKoseiAnnual(O, deceased)).toBeCloseTo(expected, 0);
  });

  it("自営（第1号）には遺族厚生年金が出ない", () => {
    expect(izokuKoseiAnnual(O, { age: 40, income: 6_000_000, employment: "self" })).toBe(0);
  });

  it("中高齢寡婦加算 ＝ 635,500 円（子が18歳を超えてから65歳まで）", () => {
    const got = chukoreiKafuAnnual(O, {
      survivorAgeAtDeath: 45,
      survivorAgeNow: 52,
      childrenAgesNow: [19],
      hasChildAtDeath: true,
    });
    expect(got).toBe(635_500);
  });
});

/**
 * 値の検査：いまの `params` と公式値の差。
 *
 * **ここが落ちること自体が成果物である。** 落ちたら「`params` が公式と違う」と分かり、
 * どれだけ違うかが差分に出る。式の検査（上）が通っているので、**原因は値であって式ではない**。
 */
describe("値の検査：params と公式値の差（2026-09-21 時点）", () => {
  /** 公式と一致している項目 */
  it.each([
    ["childAdd3plus", OFFICIAL.childAdd3plus],
    ["hoshuHireiCoef", OFFICIAL.hoshuHireiCoef],
    ["minimumInsuredMonths", OFFICIAL.minimumInsuredMonths],
    ["izokuKoseiRatio", OFFICIAL.izokuKoseiRatio],
  ] as const)("%s は公式値と一致している", (key, expected) => {
    expect(P.public[key].value).toBe(expected);
  });

  /**
   * **公式値とズレている3項目。**
   * いずれも `verified: false`（一次情報で未確認）のまま残っていたもの。
   *
   * - `izokuKisoBase` / `childAdd1_2` … 制度監視が 2026-09-20 に検出済み。承認待ち
   * - `chukoreiKafuAdd` … **監視の対象外**だった。出典が「老齢基礎年金満額の3/4相当」＝
   *   公式に印刷された額ではなく**自前の導出**で、公式ガイドは 635,500 円と書いている
   *
   * この3件を直したらこのテストも書き換える（そのとき `verified: true` にできる）。
   */
  it.each([
    ["izokuKisoBase", 847_500, OFFICIAL.izokuKisoBase],
    ["childAdd1_2", 243_900, OFFICIAL.childAdd1_2],
    ["chukoreiKafuAdd", 635_700, OFFICIAL.chukoreiKafuAdd],
  ] as const)("%s は公式値とズレている（現在 %d ／ 公式 %d）", (key, current, official) => {
    expect(P.public[key].value).toBe(current);
    expect(P.public[key].value).not.toBe(official);
    // 一次情報で未確認のまま、が明示されている
    expect(P.public[key].verified).toBe(false);
  });

  it("ズレの合計は、子2人世帯の遺族基礎年金で年400円", () => {
    const now = izokuKisoAnnual(P, [8, 5]);
    const official = izokuKisoAnnual(withOfficial(), [8, 5]);
    expect(now - official).toBe(400);
  });
});
