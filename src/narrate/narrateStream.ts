/**
 * ストリーミング言語化の検査ループ（T-07 / T-08）。
 *
 * 「AIの文が届くたびに検査し、落ちたら破棄してテンプレに退避する」という判断だけを持つ。
 * HTTP も API キーもここには無い（呼び出し側 = app/api/narrate が持つ）ので、
 * **偽の生成器を渡せば検査の効き目をテストできる**。ここが無検査だと、事故の有無を
 * 実APIを叩かないと確かめられなくなる。
 *
 * 検査の順序には理由がある：
 * - G-1（生の数字）と差し込めないプレースホルダは、**届いた時点**で打ち切る（画面に出す前に止める）
 * - G-2/G-4/G-6 は、**全文がそろってから**見る（結論の一致は文が閉じないと判定できない）
 */
import type { HouseholdDiagnosis } from "../calc/types.js";
import { checkGuardrails } from "./guard.js";
import { fallbackNarration, fillPlaceholders, hasNoRawNumbers } from "./narrate.js";

/** こちらが差し込めるプレースホルダ。これ以外を書かれても差し込めない */
const KNOWN_PLACEHOLDERS = ["conclusion", "selfRange", "gapAmount", "yearsDependent", "yearsAlone"];

export type FallbackReason =
  | "g1_raw_number"
  | "unknown_placeholder"
  | "guardrail"
  | "empty"
  | "ai_unavailable"
  | "timeout"
  | "api_error";

export type NarrationEvent =
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "fallback"; text: string; reason: FallbackReason; detail?: string };

/** 閉じているプレースホルダのうち、こちらが知らない名前 */
export function unknownPlaceholders(template: string): string[] {
  const found = [...template.matchAll(/\{\{([a-zA-Z]+)\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((k) => !KNOWN_PLACEHOLDERS.includes(k)))];
}

export function fallbackEvent(
  d: HouseholdDiagnosis,
  reason: FallbackReason,
  detail?: string,
): NarrationEvent {
  return { type: "fallback", text: fallbackNarration(d).text, reason, detail };
}

/**
 * 生成された差分を検査しながら流す。
 * 通信の失敗はここでは握らず、そのまま投げる（タイムアウトかどうかは呼び出し側しか知らない）。
 */
export async function* narrateStreamEvents(
  d: HouseholdDiagnosis,
  deltas: AsyncIterable<string>,
): AsyncGenerator<NarrationEvent> {
  let template = "";
  for await (const delta of deltas) {
    template += delta;

    // G-1：生の数字が出た時点で打ち切る（差し込み前に検査する＝数値は構造的に間違えない）
    if (!hasNoRawNumbers(template)) {
      yield fallbackEvent(d, "g1_raw_number");
      return;
    }
    // 差し込めないプレースホルダは、そのまま出すと壊れた文になる
    const unknown = unknownPlaceholders(template);
    if (unknown.length > 0) {
      yield fallbackEvent(d, "unknown_placeholder", unknown.join(","));
      return;
    }
    yield { type: "chunk", text: delta };
  }

  if (template.trim() === "") {
    yield fallbackEvent(d, "empty");
    return;
  }

  const guard = checkGuardrails(fillPlaceholders(template, d), d);
  if (!guard.passed) {
    yield fallbackEvent(d, "guardrail", guard.violations.join(" / "));
    return;
  }
  yield { type: "done" };
}
