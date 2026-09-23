/**
 * 提案に載せる「適用できる yaml 差分」（フェーズ2b・2026-09-22）。
 *
 * **承認は記録であって適用ではない。** params の実変更は、人がこの差分をリポジトリに当てて
 * コミットする（push も人）。そのため差分は `git apply` がそのまま通る unified diff で持つ。
 *
 * **YAML を読み直して書き出さない。** 書き出すとコメント・折り返し・引用符の書式が変わり、
 * 差分が値以外の行で膨らむ（承認者が「何が変わるか」を読めなくなる）。
 * `parseDocument` が持つ元の文字位置（range）から行を割り出し、その行だけを差し替える。
 *
 * **差分の範囲＝適用後の params が自己整合するところまで**（2026-09-22 オーナー裁定）。
 * 値だけ変えて温存の期限や改正予定が残った yaml は、「温存が続いている」と自分で主張する矛盾ファイルになる。
 */
import { isMap, isPair, isScalar, parseDocument, type Document } from "yaml";

export type YamlOp =
  /** 1行に収まるスカラー値だけを置き換える（キーとコメントは残す） */
  | { kind: "set"; path: string[]; value: number | string | boolean | null }
  /** キーと値を丸ごと消す。**直前の説明コメントも消す**（旧状態の説明なので残すと矛盾する） */
  | { kind: "delete"; path: string[] }
  /** キーと値を1行で書き直す。直前の説明コメントも消す */
  | { kind: "replace"; path: string[]; value: string | boolean | null };

/** D1 の呼び出し口（値だけを置き換える）。`set` の糖衣 */
export interface YamlEdit {
  path: string[];
  value: number;
}

const CONTEXT = 3;

function render(v: number | string | boolean | null): string {
  if (v === null) return "null";
  // **真偽値は素のまま書く。** 引用符で囲むと YAML では文字列 "true" になり、
  // `verified` のような門の値が「常に真」になってしまう（2026-09-23・D6）
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  return JSON.stringify(v); // 二重引用符。YAML の二重引用符スカラーとして読める
}

interface LineOp {
  from: number; // 置き換える最初の行（0始まり）
  to: number; // 置き換える最後の行（含む）
  lines: string[];
}

function lineOf(text: string, offset: number): number {
  let n = 0;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

function findPair(doc: Document, path: string[]) {
  const parent = path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true);
  if (!isMap(parent)) throw new Error(`yaml に位置が無い: ${path.join(".")}`);
  const key = path[path.length - 1];
  const pair = parent.items.find((p) => isPair(p) && isScalar(p.key) && p.key.value === key);
  if (!pair || !isScalar(pair.key) || !pair.key.range) {
    throw new Error(`yaml に位置が無い: ${path.join(".")}`);
  }
  return pair;
}

/** キーの行から値の終わりの行までと、その直前に続くコメント行（同じ字下げ）の範囲 */
function pairSpan(text: string, lines: string[], doc: Document, path: string[]) {
  const pair = findPair(doc, path);
  const keyStart = (pair.key as { range: [number, number, number] }).range[0];
  const value = pair.value as { range?: [number, number, number] } | null;
  const endOffset = value?.range ? Math.max(value.range[1] - 1, keyStart) : keyStart;
  const from = lineOf(text, keyStart);
  const to = lineOf(text, endOffset);
  const indent = lines[from].match(/^ */)?.[0] ?? "";
  let top = from;
  while (top > 0 && lines[top - 1].startsWith(`${indent}#`)) top--;
  return { top, from, to, indent };
}

/** 操作を当てた新しい全文。位置が見つからなければ例外（黙って足さない） */
export function applyOps(text: string, ops: YamlOp[]): string {
  const doc = parseDocument(text);
  const lines = text.split("\n");
  const lineOps: LineOp[] = ops.map((op) => {
    if (op.kind === "set") {
      const node = doc.getIn(op.path, true);
      if (!isScalar(node) || !node.range)
        throw new Error(`yaml に値の位置が無い: ${op.path.join(".")}`);
      const [start, end] = node.range;
      const ln = lineOf(text, start);
      if (lineOf(text, end) !== ln)
        throw new Error(`1行に収まらない値は set できない: ${op.path.join(".")}`);
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const line = lines[ln];
      const next =
        line.slice(0, start - lineStart) + render(op.value) + line.slice(end - lineStart);
      return { from: ln, to: ln, lines: [next] };
    }
    const span = pairSpan(text, lines, doc, op.path);
    const key = op.path[op.path.length - 1];
    return {
      from: span.top,
      to: span.to,
      lines: op.kind === "delete" ? [] : [`${span.indent}${key}: ${render(op.value)}`],
    };
  });

  // 後ろから当てる（前を当てると後ろの行番号がずれる）。範囲が重なったら止める
  const sorted = [...lineOps].sort((a, b) => b.from - a.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].to >= sorted[i - 1].from) throw new Error("yaml の操作範囲が重なっている");
  }
  const out = [...lines];
  for (const o of sorted) out.splice(o.from, o.to - o.from + 1, ...o.lines);
  return out.join("\n");
}

/** D1 互換：値の文字だけを置き換える */
export function applyEdits(text: string, edits: YamlEdit[]): string {
  return applyOps(
    text,
    edits.map((e) => ({ kind: "set", path: e.path, value: e.value })),
  );
}

/**
 * unified diff（`git apply` 形式）。行の追加・削除があるので LCS で対応を取る。
 * 変わった行の前後 3 行を文脈に付け、近い変更は1つの塊にまとめる。
 */
export function unifiedDiff(file: string, before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  if (before === after) return "";

  // LCS の表（params は数百行なので O(n·m) で足りる）
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  /** ai / bi は、その行を処理する**前**の a / b の位置（0始まり） */
  type Row = { tag: " " | "-" | "+"; text: string; ai: number; bi: number };
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ tag: " ", text: a[i], ai: i, bi: j });
      i++;
      j++;
    } else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) {
      // 同点なら削除を先に出す（人が読む順は「-」のあとに「+」）
      rows.push({ tag: "-", text: a[i], ai: i, bi: j });
      i++;
    } else {
      rows.push({ tag: "+", text: b[j], ai: i, bi: j });
      j++;
    }
  }

  // 変更行の周り CONTEXT 行を残して塊にする
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((r, k) => {
    if (r.tag === " ") return;
    for (let x = Math.max(0, k - CONTEXT); x <= Math.min(rows.length - 1, k + CONTEXT); x++) {
      keep[x] = true;
    }
  });
  const out = [`--- a/${file}`, `+++ b/${file}`];
  let k = 0;
  while (k < rows.length) {
    if (!keep[k]) {
      k++;
      continue;
    }
    let end = k;
    while (end + 1 < rows.length && keep[end + 1]) end++;
    const chunk = rows.slice(k, end + 1);
    const aLen = chunk.filter((r) => r.tag !== "+").length;
    const bLen = chunk.filter((r) => r.tag !== "-").length;
    // 見出しは1始まり。長さ0の側は「直前の行番号」を書く（git の約束）
    const aStart = aLen > 0 ? chunk[0].ai + 1 : chunk[0].ai;
    const bStart = bLen > 0 ? chunk[0].bi + 1 : chunk[0].bi;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const r of chunk) out.push(`${r.tag}${r.text}`);
    k = end + 1;
  }
  return `${out.join("\n")}\n`;
}

export function buildYamlPatch(file: string, text: string, ops: YamlOp[] | YamlEdit[]): string {
  const normalized: YamlOp[] = (ops as Array<YamlOp | YamlEdit>).map((o) =>
    "kind" in o ? o : { kind: "set", path: o.path, value: o.value },
  );
  return unifiedDiff(file, text, applyOps(text, normalized));
}
