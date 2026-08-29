/**
 * AI言語化（T-07）─ スタブ実装
 *
 * 設計の核（CLAUDE.md / SPEC §5）：
 * - **AIには数値を書かせない**。`{{selfRange}}` のようなプレースホルダだけを出させ、
 *   算定結果を差し込むのはこちら側。これで数値は構造的に間違えようがなく、検査もしやすい。
 * - 生成テンプレに「プレースホルダ以外の生の数字」があれば **G-1 で不合格 → テンプレにフォールバック**。
 * - ここは AI の代わりの**スタブ**（APIキー無しで動く）。本番は narrateStub を実 LLM 呼び出しに差し替える。
 *   その際もこの「プレースホルダのみ／G-1 検査／フォールバック」の枠は変えない。
 */
import type { HouseholdDiagnosis } from "../calc/types.js";
import { formatMan, formatRange } from "../design/tokens.js";
import { checkGuardrails } from "./guard.js";
import type { PlaceholderValues } from "./stream.js";

const CONCLUSION: Record<string, string> = {
  all_covered: "足りています",
  reducible: "減らせる余地がありそうです",
  rebalanceable: "世帯全体で見直せそうです",
  shortage: "足りない可能性があります",
};

/**
 * テンプレに差し込む値（数値はここでだけ作る＝算定結果由来）。
 * ストリーミング表示ではクライアント側が1文字ずつ差し込むので、この map だけを渡す。
 */
export function placeholderValues(d: HouseholdDiagnosis): PlaceholderValues {
  return {
    conclusion: CONCLUSION[d.householdHeadline.kind] ?? "",
    selfRange: formatRange(d.self.range.low, d.self.range.high),
    gapAmount: formatMan(d.self.gap.amount),
  };
}

/** テンプレに差し込む（一括生成のとき用） */
export function fillPlaceholders(template: string, d: HouseholdDiagnosis): string {
  const map = placeholderValues(d);
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, k: string) => map[k] ?? "");
}

/**
 * G-1（数値照合の核）：テンプレにプレースホルダ以外の「生の数字」が無いか。
 * AI が数字を書いたら true を返せないので、フォールバックへ回す。
 */
export function hasNoRawNumbers(template: string): boolean {
  const withoutPlaceholders = template.replace(/\{\{[a-zA-Z]+\}\}/g, "");
  return !/[0-9０-９]/.test(withoutPlaceholders);
}

/** AI の代わりのスタブ。状況で文面を変えるが、数値は書かずプレースホルダだけ使う。 */
export function narrateStub(d: HouseholdDiagnosis): string {
  const pending = d.self.gap.kind === "pending";
  if (pending) {
    return "いまの保険内容が分からないので、過不足はまだ出していません。あなたに万一のとき、遺されたご家族に必要な保障の目安は {{selfRange}} です。証券が見つかったら、いまの保険と比べられます。";
  }
  switch (d.householdHeadline.kind) {
    case "shortage":
      return "いまの前提では、{{conclusion}}。遺されたご家族に必要な保障の目安は {{selfRange}} で、いまの保険と比べると {{gapAmount}} ほど足りないかもしれません。お子さんの生活費と教育費が大きな部分です。あわてず、まずは前提を確かめてみてください。";
    case "reducible":
      return "いまの前提では、{{conclusion}}。必要な保障の目安は {{selfRange}} です。いまの保険は {{gapAmount}} ほど減らせる余地がありそうで、保険料が浮くのは良い知らせです。";
    case "rebalanceable":
      return "いまの前提では、{{conclusion}}。必要な保障の目安は {{selfRange}} です。ご夫婦のどちらかが多め・どちらかが少なめなので、世帯全体で見ると合計の保険料を増やさずに整えられそうです。";
    default:
      return "いまの前提では、{{conclusion}}。必要な保障の目安は {{selfRange}} です。いまの備えで大きな不足はなさそうです。";
  }
}

export interface Narration {
  text: string;
  /** ai=実LLM生成が検査を通った / ai-stub=スタブ生成が通った / fallback=生数字混入などでテンプレに退避 */
  source: "ai" | "ai-stub" | "fallback";
}

const FALLBACK: Record<string, string> = {
  all_covered: "いまの前提では、必要な保障の目安は {{selfRange}} で、大きな不足はなさそうです。",
  reducible:
    "いまの前提では、必要な保障の目安は {{selfRange}} で、いまの保険は減らせる余地がありそうです。",
  rebalanceable:
    "いまの前提では、必要な保障の目安は {{selfRange}} です。世帯全体で見直せそうです。",
  shortage: "いまの前提では、必要な保障の目安は {{selfRange}} で、足りない可能性があります。",
};

/** 検査に落ちたとき・AIを止めたときの退避文（実LLM側からも使う） */
export function fallbackNarration(d: HouseholdDiagnosis): Narration {
  const fb = FALLBACK[d.householdHeadline.kind] ?? FALLBACK.shortage;
  return { text: fillPlaceholders(fb, d), source: "fallback" };
}

export function narrate(d: HouseholdDiagnosis): Narration {
  const template = narrateStub(d);
  // G-1：生の数字が混ざったテンプレはフォールバック（差し込み前に検査）
  if (!hasNoRawNumbers(template)) return fallbackNarration(d);
  const text = fillPlaceholders(template, d);
  // G-2/G-4/G-6：差し込み済みテキストを検査。落ちたらフォールバック（本番は再生成→2回で退避）。
  if (!checkGuardrails(text, d).passed) return fallbackNarration(d);
  return { text, source: "ai-stub" };
}
