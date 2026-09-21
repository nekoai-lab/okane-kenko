import { loadParams, v } from "../src/params/index.js";
import { diagnose } from "../src/calc/index.js";
import { decodeSelections } from "../src/wizard/url.js";
import { toCompleteSelections } from "../src/wizard/complete.js";
import { normalize } from "../src/wizard/normalize.js";

const p = loadParams("2026-08");
const q = new URLSearchParams("v=1&sb=1986&emp=employee&sp=1&spb=1988&spe=employee&ch=2018-2021&edu=public&inc=lt800&sinc=lt400&as=lt1000&liv=lt30&ho=own_loan&loan=lt3000&dan=yes&cvs=m3000&cvsp=m500");
const sel = toCompleteSelections(decodeSelections(q))!;
const asOf = new Date("2026-09-21T00:00:00+09:00");
const n = normalize(p, sel, asOf);
const input = n.input;
const d = diagnose(p, input, asOf);
const man = (x: number) => (x / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + "万";

console.log("【入力】");
console.log("  本人年収", man(input.self.income), "/ 配偶者年収", man(input.spouse!.income));
console.log("  子の年齢", input.children, "/ 生活費", man(input.monthlyLiving) + "/月");
console.log("  資産", man(input.assets), "/ 住居", JSON.stringify(input.housing));
console.log("\n【本人が亡くなった場合】期間: 子育て期", d.self.years.dependent, "年 / 末子独立後", d.self.years.alone, "年");
console.log("  支出");
for (const [k, val] of Object.entries(d.self.expense)) console.log("   ", k, man(val as number));
console.log("  収入");
for (const [k, val] of Object.entries(d.self.income)) console.log("   ", k, man(val as number));
console.log("  rawNeed", man(d.self.rawNeed), "/ margin", man(d.self.margin), "/ verdict", d.self.verdict);
console.log("  ample の閾値: margin >", man(d.self.expense.total * v(p, "amplemarginRatio")), `(= 支出合計 × ${v(p, "amplemarginRatio")})`);
console.log("\n【前提の出どころ】");
for (const e of n.estimations) console.log("   -", e.field, ":", e.note);
