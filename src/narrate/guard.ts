/**
 * ガードレール（T-08）─ AI出力を機械的に検査する。
 *
 * 芯：AIの出力は文章だけ（副作用なし）なので、検査に落ちたら破棄して**テンプレにフォールバック**するだけで済む。
 * 禁止語辞書は「検査側」に持つ（プロンプトに入れない＝AIに手本を見せない）。
 * G-1（数値照合）は narrate.ts の hasNoRawNumbers。ここは G-2/G-4/G-6。
 */
import type { HouseholdDiagnosis } from "../calc/types.js";

/**
 * **行動を急かす語彙**（「煽らない」の定義3・2026-09-21 オーナー確定）。
 *
 * ここが本籍。AI出力だけでなく**エンジンが持つ固定文（制度の注記など）も同じ語彙を使わない**ので、
 * 画面側のテストからも参照する。
 *
 * 「煽らない」の定義：
 * 1. **事実と異なる安心を言わない**
 * 2. 不安を与える事実には「いつ・誰が・何が変わるか」を必ず添える
 * 3. **行動を急かす語彙を使わない**（このリスト）
 *
 * 定義1が要る理由：2026-09-21 まで、35歳の配偶者がいる世帯にも
 * 「お子さんがいるので2028年改正は直撃しません」と出していた。
 * 事実と異なる安心は、この製品が保険業界に対して批判している行為そのものだった。
 */
export const RUSHING_WORDS: readonly string[] = [
  "今すぐ",
  "手遅れ",
  "大変なことに",
  "急いで",
  "お早めに",
  "早めに手を打",
  "後悔します",
  "いまのうちに",
];

/** G-2/G-6：禁止語（勧誘・煽り・最上級・投資商品）。商品名・会社名の網羅は台帳で育てる（暫定リスト）。 */
export const FORBIDDEN_WORDS: readonly string[] = [
  // 煽り・勧誘（CLAUDE.md「絶対にやらないこと」4）
  ...RUSHING_WORDS,
  "絶対",
  // 最上級・断定的な優劣
  "最高",
  "最強",
  "No.1",
  "ナンバーワン",
  "業界一",
  "日本一",
  // 投資商品（G-6・CR-05）
  "NISA",
  "利回り",
  "投資信託",
  "運用で増や",
  "株で",
];

export interface GuardResult {
  passed: boolean;
  violations: string[];
}

/** AI出力（差し込み済みテキスト）を検査する。 */
export function checkGuardrails(text: string, d: HouseholdDiagnosis): GuardResult {
  const violations: string[] = [];

  // G-2 / G-6：禁止語
  for (const w of FORBIDDEN_WORDS) {
    if (text.includes(w)) violations.push(`禁止語: ${w}`);
  }

  // G-4：結論の一致（算定の結論と矛盾していないか）。pending は結論を断定しないので対象外。
  if (d.self.gap.kind !== "pending") {
    const isShortage = d.householdHeadline.kind === "shortage";
    if (isShortage && /足りています|十分/.test(text)) {
      violations.push("結論矛盾：不足なのに足りると言っている");
    }
    if (!isShortage && /足りない/.test(text)) {
      violations.push("結論矛盾：足りるのに足りないと言っている");
    }
  }

  return { passed: violations.length === 0, violations };
}
