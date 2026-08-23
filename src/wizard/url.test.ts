/**
 * URL 状態 ⇄ 選択のテスト（FR-08 / US-03）
 *
 * 往復で失われないこと、途中状態を扱えること、書き換えられた URL で壊れないことを固定する。
 */
import { describe, expect, it } from "vitest";
import { decodeSelections, encodeSelections, WIZARD_URL_VERSION } from "./url.js";
import type { WizardSelections } from "./types.js";

const full: WizardSelections = {
  selfBirthYear: 1989,
  selfEmployment: "employee",
  hasSpouse: true,
  spouseBirthYear: 1991,
  spouseEmployment: "none",
  childrenBirthYears: [2018, 2021],
  selfIncome: "lt600",
  spouseIncome: "none",
  assets: "lt500",
  livingCost: "estimate",
  housing: "own_loan",
  loan: "lt3000",
  danshin: "unknown",
  coverageSelf: "m2000",
  coverageSpouse: "unknown",
};

describe("URL 状態の往復", () => {
  it("完全な選択は往復しても失われない", () => {
    expect(decodeSelections(encodeSelections(full))).toEqual(full);
  });

  it("途中状態（一部だけ回答）も往復できる", () => {
    const partial = { selfBirthYear: 1990, selfEmployment: "self" as const, hasSpouse: false };
    expect(decodeSelections(encodeSelections(partial))).toEqual(partial);
  });

  it("子0人（回答済み）と未回答を区別する", () => {
    // 0人は空配列として復元される（undefined にしない）
    expect(decodeSelections(encodeSelections({ childrenBirthYears: [] }))).toEqual({
      childrenBirthYears: [],
    });
    // ch を載せなければ未回答のまま
    expect(decodeSelections("v=1").childrenBirthYears).toBeUndefined();
  });

  it("実額はURLに載らない（区分コードのみ）", () => {
    const s = encodeSelections(full);
    expect(s).not.toMatch(/\d{6,}/); // 5,000,000 のような実額が出ない
    expect(s).toContain("inc=lt600");
  });

  it("配偶者なしは spouse 情報を含めない", () => {
    const s = encodeSelections({ hasSpouse: false });
    expect(s).toContain("sp=0");
    expect(s).not.toContain("spb=");
  });
});

describe("壊れた URL に強い", () => {
  it("版が違う URL は無視する", () => {
    expect(decodeSelections(`v=99&inc=lt600`)).toEqual({});
  });

  it("未知のコードは落として未回答扱いにする", () => {
    const decoded = decodeSelections(`v=${WIZARD_URL_VERSION}&inc=BOGUS&as=lt500`);
    expect(decoded.selfIncome).toBeUndefined();
    expect(decoded.assets).toBe("lt500");
  });

  it("範囲外の生年は落とす", () => {
    const decoded = decodeSelections(`v=${WIZARD_URL_VERSION}&sb=99`);
    expect(decoded.selfBirthYear).toBeUndefined();
  });

  it("子の生年に不正が混じれば配列ごと落とす", () => {
    const decoded = decodeSelections(`v=${WIZARD_URL_VERSION}&ch=2018-abc`);
    expect(decoded.childrenBirthYears).toBeUndefined();
  });
});
