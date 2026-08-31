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
