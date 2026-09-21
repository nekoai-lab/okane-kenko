/**
 * 提案に載せる「適用できる yaml 差分」（フェーズ2b・2026-09-22）。
 *
 * **承認は記録であって適用ではない。** params の実変更は、人がこの差分をリポジトリに当てて
 * コミットする（push も人）。そのため差分は `git apply` がそのまま通る unified diff で持つ。
 *
 * **値の文字だけを置き換える。** YAML を読み直して書き出すと、コメント・折り返し・引用符の
 * 書式が変わり、差分が値以外の行で膨らむ（承認者が「何が変わるか」を読めなくなる）。
 * `parseDocument` が持つ元の文字位置（range）で、その値の文字列だけを差し替える。
 */
import { isScalar, parseDocument } from "yaml";

export interface YamlEdit {
  path: string[];
  value: number;
}

const CONTEXT = 3;

/** 値だけを差し替えた新しい全文。位置が見つからない・数値でなければ例外（黙って足さない） */
export function applyEdits(text: string, edits: YamlEdit[]): string {
  const doc = parseDocument(text);
  const spans = edits.map((e) => {
    const node = doc.getIn(e.path, true);
    if (!isScalar(node) || typeof node.value !== "number" || !node.range) {
      throw new Error(`yaml に数値の位置が無い: ${e.path.join(".")}`);
    }
    return { start: node.range[0], end: node.range[1], value: String(e.value) };
  });
  // 後ろから置き換える（前を置き換えると後ろの位置がずれる）
  let out = text;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + s.value + out.slice(s.end);
  }
  return out;
}

/**
 * unified diff（`git apply` 形式）。値の置き換えだけなので行数は変わらない前提で、
 * 変わった行の前後 3 行を文脈に付ける。近い変更は1つの塊にまとめる。
 */
export function unifiedDiff(file: string, before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length !== b.length) throw new Error("値の置き換えで行数が変わった（想定外）");

  const changed = a.map((line, i) => (line !== b[i] ? i : -1)).filter((i) => i >= 0);
  if (changed.length === 0) return "";

  // 文脈が重なる変更を1つの塊にする
  const hunks: Array<{ from: number; to: number }> = [];
  for (const i of changed) {
    const from = Math.max(0, i - CONTEXT);
    const to = Math.min(a.length - 1, i + CONTEXT);
    const last = hunks[hunks.length - 1];
    if (last && from <= last.to + 1) last.to = to;
    else hunks.push({ from, to });
  }

  const lines = [`--- a/${file}`, `+++ b/${file}`];
  for (const h of hunks) {
    const n = h.to - h.from + 1;
    lines.push(`@@ -${h.from + 1},${n} +${h.from + 1},${n} @@`);
    for (let i = h.from; i <= h.to; i++) {
      if (a[i] === b[i]) lines.push(` ${a[i]}`);
      else lines.push(`-${a[i]}`, `+${b[i]}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function buildYamlPatch(file: string, text: string, edits: YamlEdit[]): string {
  return unifiedDiff(file, text, applyEdits(text, edits));
}
