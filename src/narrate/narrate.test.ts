/**
 * AI言語化スタブのテスト（T-07）。核＝「AIは数値を書かない・G-1で生数字を弾く・落ちたら退避」。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "../__tests__/households.js";
import { fillPlaceholders, hasNoRawNumbers, narrate, narrateStub } from "./narrate.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-17T12:00:00+09:00");

describe("narrate（T-07 スタブ）", () => {
  it("全世帯でスタブのテンプレは生の数字を含まない（プレースホルダのみ）＝G-1を通る", () => {
    for (const c of GOLDEN) {
      const d = diagnose(P, c.input, AS_OF);
      expect(hasNoRawNumbers(narrateStub(d))).toBe(true);
    }
  });

  it("生の数字が混ざったテンプレは G-1 で弾く", () => {
    expect(hasNoRawNumbers("必要額は約500万円です")).toBe(false);
    expect(hasNoRawNumbers("必要額は約３００万円です")).toBe(false);
    expect(hasNoRawNumbers("必要額は {{selfRange}} です")).toBe(true);
  });

  it("差し込みは算定結果の値を入れ、プレースホルダを残さない", () => {
    const d = diagnose(P, GOLDEN[1].input, AS_OF); // GT-02
    const text = fillPlaceholders("目安は {{selfRange}} です", d);
    expect(text).toContain("万円");
    expect(text).not.toContain("{{");
  });

  it("narrate は G-1 を通ったスタブ文を返し、レンジが差し込まれる", () => {
    const d = diagnose(P, GOLDEN[1].input, AS_OF);
    const n = narrate(d);
    expect(n.source).toBe("ai-stub");
    expect(n.text).toContain("万円");
    expect(n.text).not.toMatch(/\{\{/);
  });

  it("保険が分からない世帯は pending の文面になる（過不足を断定しない）", () => {
    const d = diagnose(P, { ...GOLDEN[1].input, coverageSelf: null }, AS_OF);
    const n = narrate(d);
    expect(n.text).toContain("過不足はまだ");
  });
});
