/**
 * 暮らし方の目盛りの URL 状態（#4）
 *
 * **既定は URL に書かない。** 書くと同じ状態を指す URL が2通りでき、
 * 「同じ診療記録か」の判定が要らぬ仕事になる。
 */
import { describe, expect, it } from "vitest";
import { decodeLivingLevel, withLivingLevel } from "./dial.js";

const BASE = "v=1&sb=1986&liv=lt30";

describe("目盛りの URL 状態", () => {
  it("パラメータが無ければ既定（いま通り）", () => {
    expect(decodeLivingLevel(BASE)).toBe("asis");
  });

  it("**`asis` 明示の URL と、パラメータ無しの URL が同じ結果になる**", () => {
    expect(decodeLivingLevel(`${BASE}&dial=asis`)).toBe(decodeLivingLevel(BASE));
    // 書き出したときも同じ URL になる（既定は消える）
    expect(withLivingLevel(`${BASE}&dial=asis`, "asis")).toBe(withLivingLevel(BASE, "asis"));
    expect(withLivingLevel(BASE, "asis")).not.toContain("dial=");
  });

  it("既定以外はクエリに載る", () => {
    expect(withLivingLevel(BASE, "tight")).toContain("dial=tight");
    expect(withLivingLevel(BASE, "roomy")).toContain("dial=roomy");
    expect(decodeLivingLevel(withLivingLevel(BASE, "roomy"))).toBe("roomy");
  });

  it("目盛りを切り替えても、回答のクエリは壊れない", () => {
    const q = withLivingLevel(withLivingLevel(BASE, "tight"), "roomy");
    expect(new URLSearchParams(q).get("liv")).toBe("lt30");
    expect(new URLSearchParams(q).get("dial")).toBe("roomy");
  });

  it("未知の値は既定に倒す（URL を書き換えられても壊さない）", () => {
    expect(decodeLivingLevel(`${BASE}&dial=zzz`)).toBe("asis");
  });
});
