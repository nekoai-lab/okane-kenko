/**
 * 「検証版です」の告知と、本番ゲート（strictVerified）が**同じ判定を使う**ことを固定する。
 *
 * ここがずれると、静かに壊れる：
 * - 全部 verified になったのにバナーが残る → 嘘の注意書きが出続ける
 * - 未確認が残っているのにバナーが消える → 確定値だと思われたまま持ち帰られる
 *
 * どちらもエラーを出さないので、このテスト以外に気づく手段がない。
 */
import { describe, expect, it } from "vitest";
import { assertUsable, loadParams, unverifiedKeys } from "./index.js";

/** 有効期間内の日付を使う（期限切れで落ちると、確認したい等価性が見えなくなる） */
function withinValidity(effectiveTo: string): Date {
  return new Date(`${effectiveTo}T00:00:00+09:00`);
}

describe("未確認パラメータの判定", () => {
  it("unverifiedKeys が空でないときだけ、strictVerified は診断を止める", () => {
    const p = loadParams();
    const asOf = withinValidity(p.effectiveTo);

    const hasUnverified = unverifiedKeys(p).length > 0;
    let stopped = false;
    try {
      assertUsable(p, asOf, { strictVerified: true });
    } catch {
      stopped = true;
    }

    expect(stopped).toBe(hasUnverified);
  });

  it("すべて verified にすると、告知も本番ゲートも消える", () => {
    const p = structuredClone(loadParams());
    for (const e of Object.values(p.public)) e.verified = true;
    for (const e of Object.values(p.toBeSourced)) e.verified = true;
    p.education.university.verified = true;
    p.education.shien.verified = true;

    expect(unverifiedKeys(p)).toEqual([]);
    expect(() =>
      assertUsable(p, withinValidity(p.effectiveTo), { strictVerified: true }),
    ).not.toThrow();
  });

  it("1つでも verified:false があれば、告知は出るし本番ゲートも止める", () => {
    const p = structuredClone(loadParams());
    for (const e of Object.values(p.public)) e.verified = true;
    for (const e of Object.values(p.toBeSourced)) e.verified = true;
    p.education.university.verified = true;
    p.education.shien.verified = false; // 1つだけ戻す

    expect(unverifiedKeys(p)).toContain("education.shien");
    expect(() =>
      assertUsable(p, withinValidity(p.effectiveTo), { strictVerified: true }),
    ).toThrow();
  });
});

/**
 * **当社基準の在庫が、実際に使われている値とずれないこと**（2026-09-21）
 *
 * `fallbackFinancialAssets` と `livingCostEstimateRatio` は
 * 「公的出典のない当社基準」の一覧に載せるために置いた行で、
 * **値そのものは別の場所（`inputRanges` / 算定側）が持っている**。
 *
 * 在庫と正本を2か所に書いた瞬間、片方だけ直して**一覧のほうが静かに古くなる**。
 * それは「当社基準を全部並べて見せる」という約束を、エラーを出さずに破る壊れ方なので、
 * ここで等式を固定する（`funeralFloorRule` が額を `toBeSourced` に残しているのと同じ理由）。
 */
describe("当社基準の在庫と、実際に使う値が一致する", () => {
  it("fallbackFinancialAssets ＝ inputRanges.assets.unknown", () => {
    const p = loadParams();
    expect(p.ownStandard.fallbackFinancialAssets.value).toBe(p.inputRanges.assets.unknown);
  });

  it("livingCostEstimateRatio ＝ 旧キー livingCostFromIncome（別名は同じ値を指す）", () => {
    const p = loadParams();
    expect(p.ownStandard.livingCostEstimateRatio.value).toBe(
      p.ownStandard.livingCostFromIncome.value,
    );
  });

  it("**掛ける相手は手取り**であることがラベルに書いてある（年収と読めるラベルにしない）", () => {
    const p = loadParams();
    expect(p.ownStandard.livingCostEstimateRatio.label).toContain("手取り");
  });
});
