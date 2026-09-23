/**
 * 回答の区分コード → 画面に出す言葉（2026-09-23・T-H で共有化）。
 *
 * **写しを2本にしない。** 以前はウィザードの画面（`app/wizard/page.tsx`）の中だけにあったが、
 * 結果画面の「この幅は、答えの幅（◯◯）から来ています」でも**同じ言葉**が要る。
 * 別々に持つと、区分を足した日に片方だけ古くなる。
 *
 * **ここに書くのは言葉だけ。** 値（代表値・帯の端）は `params.inputRanges` が持つ。
 */
import type { AssetCode, IncomeCode, LivingCode, LoanCode, SpouseIncomeCode } from "./types.js";

export const INCOME_LABEL: [IncomeCode, string][] = [
  ["lt400", "400万円以下"],
  ["lt600", "400〜600万円"],
  ["lt800", "600〜800万円"],
  ["lt1000", "800〜1000万円"],
  ["gte1000", "1000万円以上"],
  ["prefer_not", "答えたくない"],
];

export const SPOUSE_INCOME_LABEL: [SpouseIncomeCode, string][] = [
  ["none", "収入なし"],
  ...INCOME_LABEL,
];

export const ASSETS_LABEL: [AssetCode, string][] = [
  ["lt100", "100万円以下"],
  ["lt300", "100〜300万円"],
  ["lt500", "300〜500万円"],
  ["lt1000", "500〜1000万円"],
  ["gte1000", "1000万円以上"],
  ["unknown", "分からない"],
];

export const LIVING_LABEL: [LivingCode, string][] = [
  ["lt20", "20万円以下"],
  ["lt25", "20〜25万円"],
  ["lt30", "25〜30万円"],
  ["lt35", "30〜35万円"],
  ["gte35", "35万円以上"],
  ["estimate", "年収からおまかせで推定する"],
];

export const LOAN_LABEL: [LoanCode, string][] = [
  ["lt500", "500万円以下"],
  ["lt1000", "500〜1000万円"],
  ["lt1500", "1000〜1500万円"],
  ["lt2000", "1500〜2000万円"],
  ["lt3000", "2000〜3000万円"],
  ["gte3000", "3000万円以上"],
  ["unknown", "分からない"],
];

/** 一覧から1つ引く。**無いコードは黙って通さない**（コードを足した日に気づけるように） */
export function labelOf(table: [string, string][], code: string | undefined): string | undefined {
  if (code === undefined) return undefined;
  return table.find(([c]) => c === code)?.[1];
}
