/**
 * 当社基準の在庫を画面に出すときの値の文字列（#9・2026-09-22）。
 *
 * **値は params の1か所だけに置き、画面はここを通して描く。**
 * ラベルに値を書き写すと、値を変えたときにラベルだけ古く残る（903831e で直した壊れ方）。
 *
 * **単位の無い在庫は例外にする。** 単位の無い数字を画面に出さない（デザイン方針）ので、
 * 在庫に `unit` を書き忘れたらテストで落ちるようにしている。
 */
import { formatMan } from "../design/tokens.js";
import type { ParamEntry } from "./index.js";

const ratio = (n: number) => `${n.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}倍`;

/** 値の文字列。`flag`（置き方そのものが基準で、値に意味が無い）は `null` */
export function ownStandardValueText(e: ParamEntry): string | null {
  switch (e.unit) {
    case "ratio":
      return e.values ? Object.values(e.values).map(ratio).join("／") : ratio(e.value);
    case "months":
      return `${e.value}か月`;
    case "JPY":
      return formatMan(e.value);
    case "JPY/year":
      return `年${formatMan(e.value)}`;
    case "flag":
      return null;
    default:
      throw new Error(`当社基準の単位が不明です: ${e.label ?? ""}（unit=${e.unit ?? "なし"}）`);
  }
}
