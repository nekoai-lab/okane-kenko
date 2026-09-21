/**
 * **一時状態を YAML コメントに書かない**（2026-09-22 オーナー裁定）。
 *
 * 温存・保留・期限つき警告のような一時状態は、`pendingChange` / `expires` / `note` の
 * 構造化フィールドに置く。コメントは機械が管理できない場所なので、そこに状態を書くと、
 * 状態が解けたときに差分が消し忘れる（2026-09-22、給付制限の「⚠️ 改正を反映していない」で実際に起きかけた）。
 *
 * `RUSHING_WORDS` が「急かさない」を機械化したのと同じで、これは「コメントに状態を書かない」の機械化。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** コメントに現れたら一時状態を書いている疑いが強い語 */
const STATE_WORDS = ["温存", "⚠️", "TODO", "保留", "暫定", "未反映", "反映していない"];

function stateComments(file: string): string[] {
  return readFileSync(join(process.cwd(), file), "utf-8")
    .split("\n")
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => line.trimStart().startsWith("#"))
    .filter(({ line }) => STATE_WORDS.some((w) => line.includes(w)))
    .map(({ line, no }) => `${file}:${no} ${line.trim()}`);
}

describe("YAML のコメントに一時状態を書かない", () => {
  it("params/watch-sources.yaml のコメントに状態語が無い", () => {
    expect(stateComments("params/watch-sources.yaml")).toEqual([]);
  });
});
