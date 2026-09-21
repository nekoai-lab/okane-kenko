import { loadParams } from "../src/params/index.js";
import { projectDeath } from "../src/calc/projection.js";
import { decodeSelections } from "../src/wizard/url.js";
import { toCompleteSelections } from "../src/wizard/complete.js";
import { normalize } from "../src/wizard/normalize.js";

const p = loadParams("2026-08");
const q = new URLSearchParams("v=1&sb=1986&emp=employee&sp=1&spb=1988&spe=employee&ch=2018-2021&edu=public&inc=lt800&sinc=lt400&as=lt1000&liv=lt30&ho=own_loan&loan=lt3000&dan=yes&cvs=m3000&cvsp=m500");
const input = normalize(p, toCompleteSelections(decodeSelections(q))!, new Date("2026-09-21T00:00:00+09:00")).input;
const man = (x: number) => (x / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + "万";

for (const cov of [0, 30_000_000]) {
  const pj = projectDeath(p, { children: input.children, housing: input.housing, assets: input.assets, monthlyLiving: input.monthlyLiving, educationPlan: input.educationPlan, deceased: input.self, survivor: input.spouse, currentCoverage: cov }, { asOfYear: 2026 });
  const neg = pj.rows.filter((r) => r.balance < 0);
  const worst = pj.rows.reduce((a, b) => (b.balance < a.balance ? b : a));
  console.log(`保険金 ${man(cov)} のとき:`);
  console.log("   貯蓄が尽きる年:", pj.depletedAt ? pj.depletedAt.year + "年" : "尽きない");
  console.log("   マイナスの年数:", neg.length, "/ 最悪の残高:", man(worst.balance), `(${worst.year}年)`);
  console.log("   赤字の年数:", pj.rows.filter((r) => r.net < 0).length, "/ 27年");
}
