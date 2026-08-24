/**
 * ガードレールのテスト（T-08）。禁止語・結論矛盾を検知し、スタブ/フォールバックは通ることを固定。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "../__tests__/households.js";
import { checkGuardrails } from "./guard.js";
import { narrate } from "./narrate.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
const shortageCase = diagnose(P, GOLDEN[1].input, AS_OF); // GT-02 shortage

describe("guardrails（T-08）", () => {
  it("禁止語（勧誘・煽り・最上級・投資）を検知する", () => {
    expect(checkGuardrails("今すぐ絶対に入るべきです", shortageCase).passed).toBe(false);
    expect(checkGuardrails("最高の保険をNISAで運用しましょう", shortageCase).passed).toBe(false);
  });

  it("結論と矛盾する文を検知する（不足なのに『足りています』）", () => {
    const r = checkGuardrails("いまの前提では十分に足りています", shortageCase);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes("結論矛盾"))).toBe(true);
  });

  it("素直な文はガードを通る", () => {
    expect(checkGuardrails("いまの前提では、足りないかもしれません。", shortageCase).passed).toBe(
      true,
    );
  });

  it("全世帯でスタブはガードを通り、退避しない", () => {
    for (const c of GOLDEN) {
      const d = diagnose(P, c.input, AS_OF);
      const n = narrate(d);
      expect(n.source).toBe("ai-stub");
      expect(checkGuardrails(n.text, d).passed).toBe(true);
    }
  });
});
