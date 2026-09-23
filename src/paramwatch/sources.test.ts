/**
 * **一時状態を YAML コメントに書かない**（2026-09-22 オーナー裁定）。
 *
 * 温存・保留・期限つき警告のような一時状態は、`pendingChange` / `expires` / `note` の
 * 構造化フィールドに置く。コメントは機械が管理できない場所なので、そこに状態を書くと、
 * 状態が解けたときに差分が消し忘れる（2026-09-22、給付制限の「⚠️ 改正を反映していない」で実際に起きかけた）。
 *
 * `RUSHING_WORDS` が「急かさない」を機械化したのと同じで、これは「コメントに状態を書かない」の機械化。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";

/**
 * コメントに現れたら一時状態を書いている疑いが強い語。
 * **記号（⚠️）は検出語にしない。** ⚠️ は「恒久的だが重要な注意」の印としても正当に使われるので、
 * 記号で引っかけると恒久的な説明が書けなくなる（2026-09-22 オーナー裁定）。
 */
const STATE_WORDS = ["温存", "保留", "暫定", "プレースホルダ", "TODO", "未反映", "反映していない"];

function stateComments(file: string): string[] {
  return readFileSync(join(process.cwd(), file), "utf-8")
    .split("\n")
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => line.trimStart().startsWith("#"))
    .filter(({ line }) => STATE_WORDS.some((w) => line.includes(w)))
    .map(({ line, no }) => `${file}:${no} ${line.trim()}`);
}

/**
 * **ガードが走査してよいのは `params/` の下だけ**（2026-09-23）。
 *
 * `src/paramwatch/__fixtures__/pre-tg.yaml` は、T-G 適用直前の params の凍結コピーで、
 * **温存の note と「旧値をわざと残している」コメントがそのまま入っている**。
 * あれは「一時状態を書いてはいけない正本」ではなく、一時状態が残っていた当時の記録なので、
 * 走査対象に入れると誤爆する。**D6 でガードを `params/2026-08.yaml` に広げるときも、
 * 入口はこの関数に保ち、`src/` を混ぜない。**
 */
function guardTargets(): string[] {
  return readdirSync(join(process.cwd(), "params"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => `params/${f}`);
}

describe("YAML のコメントに一時状態を書かない", () => {
  it("params/watch-sources.yaml のコメントに状態語が無い", () => {
    expect(stateComments("params/watch-sources.yaml")).toEqual([]);
  });

  /**
   * **2026-09-23（D6）で `params/2026-08.yaml` まで広げた。**
   * ここに状態語が残っていた2か所（多数回該当の「改定前のプレースホルダ」と
   * 給付制限の「温存」）は、それぞれ D6 の昇格と T-G の適用で消えた。
   * **広げられるようになったこと自体が、一時状態を解消し切った証拠**になっている。
   */
  it("params/2026-08.yaml のコメントに状態語が無い", () => {
    expect(stateComments("params/2026-08.yaml")).toEqual([]);
  });

  it("走査対象（params/ の下の YAML）すべてに状態語が無い", () => {
    expect(guardTargets().flatMap(stateComments)).toEqual([]);
  });

  it("走査対象は params/ の下だけで、テスト用の凍結コピーは入らない", () => {
    const targets = guardTargets();
    expect(targets).toContain("params/watch-sources.yaml");
    expect(targets.filter((f) => f.startsWith("src/") || f.includes("__fixtures__"))).toEqual([]);
    // **凍結コピーは、対象に入れたら必ず落ちる中身**（改正前の温存コメントを保存しているため）。
    // ここが 0 件になったら、コピーが「掃除」されて被験体を失っている合図
    expect(stateComments("src/paramwatch/__fixtures__/pre-tg.yaml").length).toBeGreaterThan(0);
  });
});

/**
 * **在庫に登録した「4区分への簡約」が、実装と割れていないこと**（2026-09-23・D6）。
 *
 * 当社基準の在庫は画面にそのまま出る。値だけ置いて実装と繋がっていないと、
 * brackets を5区分に直した日に**在庫だけが「4区分」と言い続ける**
 * （導出値を正本に持たせると正本の中で食い違う、という ADR-021 と同じ壊れ方）。
 */
describe("当社基準の在庫と実装が割れない", () => {
  it("kogakuBracketCount は brackets の実際の数と一致する", () => {
    const p = loadParams("2026-08");
    expect(p.ownStandard.kogakuBracketCount?.value).toBe(p.kogaku.brackets.length);
  });

  it("区分オは brackets に無い（到達しないことの根拠）", () => {
    const p = loadParams("2026-08");
    // 一次情報の表には区分オがあるので、多数回該当の側には5件ある
    expect(Object.keys(p.kogaku.multipleOccurrence)).toHaveLength(5);
    // だが算定が引く brackets は4件（＝低所得者の区分を持たない）
    expect(p.kogaku.brackets).toHaveLength(4);
  });
});
