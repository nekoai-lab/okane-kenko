/**
 * 取得した本文から金額を取り出す（フェーズ2b）。**純粋関数・AIを使わない。**
 *
 * なぜAIに読ませないか：AIに数字を読ませると、そこが
 * **インジェクションで金額が動く経路**になる。ここを決定的にしておけば、
 * 外部サイトが何を書いていようと、出てくるのは
 * 「ルールに一致した文字列」か「不一致」かのどちらかしかない。
 *
 * 推測しない。取り出せない・複数ある・幅の外は、すべて「取り出せなかった」として止める。
 */
import type { WatchTarget } from "./sources.js";

export type ExtractOutcome =
  | { ok: true; key: string; value: number; matchedText: string }
  | { ok: false; key: string; why: "not_found" | "ambiguous" | "out_of_range"; detail: string };

/** 本文に紛れ込む指示らしき文字列。**従うためではなく、記録して見せるために探す。** */
const INSTRUCTION_MARKERS = [
  "ignore the above",
  "ignore previous",
  "disregard",
  "system prompt",
  "you are now",
  "以下の指示に従",
  "これまでの指示を無視",
  "前の指示を無視",
  "命令：",
];

export function detectInstructions(text: string): string[] {
  const lower = text.toLowerCase();
  return INSTRUCTION_MARKERS.filter((m) => lower.includes(m.toLowerCase()));
}

/**
 * **全角の数字も読む。** 厚労省の Q&A は「原則１か月」のように全角で書いている（2026-09-22）。
 * 読めないと NaN になり、`not_found` として止まる（黙って誤るのではなく止まる側だが、監視できない）。
 */
function toNumber(raw: string): number {
  const ascii = raw.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  return Number(ascii.replace(/[,，]/g, ""));
}

export function extractOne(text: string, target: WatchTarget): ExtractOutcome {
  const re = new RegExp(target.pattern, "g");
  const values = new Set<number>();
  let first = "";
  for (const m of text.matchAll(re)) {
    const captured = m[1];
    if (captured === undefined) continue;
    const n = toNumber(captured);
    if (!Number.isFinite(n)) continue;
    if (values.size === 0) first = m[0];
    values.add(n);
  }

  if (values.size === 0) {
    return { ok: false, key: target.key, why: "not_found", detail: "一致する金額が無かった" };
  }
  // **複数の違う金額が取れたら選ばない。** どれが正かをこちらで決めた瞬間に推測になる。
  if (values.size > 1) {
    return {
      ok: false,
      key: target.key,
      why: "ambiguous",
      detail: `違う金額が${values.size}件一致した（${[...values].join(" / ")}）`,
    };
  }

  const value = [...values][0];
  if (value < target.min || value > target.max) {
    return {
      ok: false,
      key: target.key,
      why: "out_of_range",
      detail: `想定の幅（${target.min}〜${target.max}）の外（${value}）`,
    };
  }
  return { ok: true, key: target.key, value, matchedText: first };
}

export function extractAll(text: string, targets: WatchTarget[]): ExtractOutcome[] {
  return targets.map((t) => extractOne(text, t));
}
