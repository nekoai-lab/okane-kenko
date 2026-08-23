/**
 * 途中状態（Partial）が「必須をすべて満たしたか」を判定する（FR-10 の必須設問）。
 *
 * ウィザードの「結果を見る」活性化と、結果ページの復元ガードで共有する（同じ規則を二重に書かない）。
 * 分岐（配偶者の有無・住まい）で必須項目が変わるので、ここに1か所だけ規則を置く。
 */
import type { WizardSelections } from "./types.js";

export function toCompleteSelections(sel: Partial<WizardSelections>): WizardSelections | null {
  // S1・共通の必須
  if (sel.selfBirthYear === undefined) return null;
  if (sel.selfEmployment === undefined) return null;
  if (sel.hasSpouse === undefined) return null;
  if (sel.childrenBirthYears === undefined) return null; // 「子の人数」に未回答（0人は空配列で回答済み）
  // 子がいる世帯は進路が必須（教育費に直結）。子0人なら不要。
  if (sel.childrenBirthYears.length > 0 && sel.educationPlan === undefined) return null;
  if (sel.selfIncome === undefined) return null;
  if (sel.assets === undefined) return null;
  if (sel.livingCost === undefined) return null;
  if (sel.housing === undefined) return null;
  if (sel.coverageSelf === undefined) return null; // S6 本人の保障額（分からない=unknown も回答済み）

  // 配偶者ありなら配偶者の3項目＋保障額が必須
  if (sel.hasSpouse) {
    if (sel.spouseBirthYear === undefined) return null;
    if (sel.spouseEmployment === undefined) return null;
    if (sel.spouseIncome === undefined) return null;
    if (sel.coverageSpouse === undefined) return null;
  }

  // 持ち家・ローンありなら残高と団信が必須
  if (sel.housing === "own_loan") {
    if (sel.loan === undefined) return null;
    if (sel.danshin === undefined) return null;
  }

  return sel as WizardSelections;
}

export function isComplete(sel: Partial<WizardSelections>): boolean {
  return toCompleteSelections(sel) !== null;
}
