/**
 * ストリーミング表示の境目のテスト（T-07）。
 * 核＝「途中まで届いたテンプレでも、壊れた形を画面に出さない」。
 */
import { describe, expect, it } from "vitest";
import { renderStreamed } from "./stream.js";

const V = {
  conclusion: "足りています",
  selfRange: "約1,000万円〜約1,200万円",
  gapAmount: "約300万円",
};

describe("renderStreamed（T-07 ストリーミング差し込み）", () => {
  it("閉じているプレースホルダは差し込む", () => {
    expect(renderStreamed("目安は {{selfRange}} です", V)).toBe(
      "目安は 約1,000万円〜約1,200万円 です",
    );
  });

  it("開きかけのプレースホルダは、閉じるまで表示しない", () => {
    expect(renderStreamed("目安は {{selfRa", V)).toBe("目安は ");
    expect(renderStreamed("目安は {{", V)).toBe("目安は ");
    expect(renderStreamed("目安は {", V)).toBe("目安は ");
  });

  it("閉じたものは差し込み、そのあとの開きかけだけを伏せる", () => {
    expect(renderStreamed("{{conclusion}}。差は {{gapAm", V)).toBe("足りています。差は ");
  });

  it("知らないプレースホルダは空にする（壊れた記号を画面に出さない）", () => {
    expect(renderStreamed("目安は {{unknownKey}} です", V)).toBe("目安は  です");
  });
});
