/**
 * ガードレールのテスト（T-08）。禁止語・結論矛盾を検知し、スタブ/フォールバックは通ることを固定。
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "../__tests__/households.js";
import { MAX_NARRATION_CHARS, SELF_PRAISE_WORDS, checkGuardrails } from "./guard.js";
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

/**
 * **UIラベル規約と長さの上限**（2026-09-21 オーナー確定）
 *
 * `RUSHING_WORDS` が「急かさない」を機械化したのと同じで、
 * `SELF_PRAISE_WORDS` は**「自称しない」の機械化**。
 * ここが本籍なので、画面のラベルもこのリストを参照して検査する。
 */
describe("UIラベル規約：品質の自己評価語を使わない", () => {
  it("自己評価語を含む文はガードに落ちる", () => {
    const d = diagnose(P, GOLDEN[0].input, AS_OF);
    const r = checkGuardrails("この やさしい説明 で、必要額をお伝えします。", d);
    expect(r.passed).toBe(false);
    expect(r.violations.join()).toContain("自己評価語");
  });

  it("**画面のラベルにも同じ語彙を使わない**（結果画面の見出し）", async () => {
    const src = await readFile(new URL("../../app/result/Narration.tsx", import.meta.url), "utf8");
    // JSX のテキストだけを見る（コメントには「やさしい説明」が経緯として残っている）
    const rendered = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const w of SELF_PRAISE_WORDS) {
      expect(rendered).not.toContain(w);
    }
    expect(rendered).toContain("この結果のよみとき");
  });

  /**
   * **由来の開示は、文言が変わっても3つの事実が残っていること**を見る。
   * 文そのものを丸ごと照合すると、整形の改行が入っただけで落ちる（実際に落ちた）。
   * 空白を潰してから、落としてはいけない3点を確かめる。
   */
  it("**由来の開示を落とさない**（ことばは AI／数字はエンジン／AI は変えられない）", async () => {
    const src = await readFile(new URL("../../app/result/Narration.tsx", import.meta.url), "utf8");
    const flat = src.replace(/\s+/g, "");
    expect(flat).toContain("ことばはAIが書いています");
    expect(flat).toContain("数字と判定は計算エンジンのもの");
    expect(flat).toContain("AIは変えられません");
  });

  /**
   * **同じ事実を2回言わない**（2026-09-21 オーナー指摘）。
   * 冒頭の分担文と末尾の※注が、700px の中で同旨を2回出していた。
   * ※注は「実際に起きたこと」だけを書く役割なので、分担そのものを繰り返さない。
   */
  it("分担の説明は1か所だけ（※注に「AI が書いています」を繰り返さない）", async () => {
    const src = await readFile(new URL("../../app/result/Narration.tsx", import.meta.url), "utf8");
    // **コメントを確実に剥がす**（経緯の記録として、同じ文がコメントに何度も出てくる）
    const jsx = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\s+/g, "");
    const n = jsx.split("AIが書いています").length - 1;
    expect(n).toBe(1);
  });
});

describe("長さの上限（読ませる気のない長文を出さない）", () => {
  it(`${MAX_NARRATION_CHARS}字を超える文はガードに落ちる`, () => {
    const d = diagnose(P, GOLDEN[0].input, AS_OF);
    const long = "あ".repeat(MAX_NARRATION_CHARS + 1);
    const r = checkGuardrails(long, d);
    expect(r.passed).toBe(false);
    expect(r.violations.join()).toContain("長すぎ");
  });

  it("**退避文（テンプレ）は全世帯で上限に収まる**（ガードが常に退避になっていない）", () => {
    for (const g of GOLDEN) {
      const t = narrate(diagnose(P, g.input, AS_OF)).text;
      expect(t.length).toBeLessThanOrEqual(MAX_NARRATION_CHARS);
    }
  });
});
