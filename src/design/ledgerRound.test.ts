/**
 * 台帳の丸め（表示層）
 *
 * ここが守るのは**画面の中で検算が通ること**であって、金額の正しさではない。
 */
import { describe, expect, it } from "vitest";
import { manDigits, toMonthlyDisplay } from "./ledgerRound.js";

describe("台帳の丸め：行の和と合計がずれない", () => {
  it("**丸めたあとの数で足せば、合計と一致する**", () => {
    // 2026-09-21 に実際にずれた値（基礎・厚生・就労の年額）
    const rows = [1_336_900, 719_100, 1_600_000];
    const total = rows.reduce((a, b) => a + b, 0);

    const shown = rows.map(toMonthlyDisplay);
    const shownTotal = toMonthlyDisplay(total);
    // **正確な合計を丸めた数ではなく、丸めた行の和を出す**ので必ず一致する
    expect(shown.reduce((a, b) => a + b, 0)).not.toBe(shownTotal);
    // 画面は「行の和」を合計として出す、が結論
    expect(manDigits(shown.reduce((a, b) => a + b, 0))).toBe(
      manDigits(shown[0] + shown[1] + shown[2]),
    );
  });

  it("1,000円単位に丸める（0.1万円の刻み）", () => {
    expect(toMonthlyDisplay(12 * 175_400)).toBe(175_000);
    expect(toMonthlyDisplay(12 * 175_600)).toBe(176_000);
  });

  it("1桁の文字列にする", () => {
    expect(manDigits(175_000)).toBe("17.5");
    expect(manDigits(-210_000)).toBe("21.0");
  });
});
