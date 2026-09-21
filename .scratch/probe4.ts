import { loadParams } from "../src/params/index.js";
import { diagnose } from "../src/calc/index.js";
import { decodeSelections } from "../src/wizard/url.js";
import { toCompleteSelections } from "../src/wizard/complete.js";
import { normalize } from "../src/wizard/normalize.js";
import { GOLDEN } from "../src/__tests__/households.js";

const p = loadParams("2026-08");
const asOf = new Date("2026-09-21T00:00:00+09:00");
const q = new URLSearchParams("v=1&sb=1986&emp=employee&sp=1&spb=1988&spe=employee&ch=2018-2021&edu=public&inc=lt800&sinc=lt400&as=lt1000&liv=lt30&ho=own_loan&loan=lt3000&dan=yes&cvs=m3000&cvsp=m500");
const base = normalize(p, toCompleteSelections(decodeSelections(q))!, asOf).input;
const man = (x: number) => (x / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + "万";

const show = (label: string, inp: typeof base) => {
  const r = diagnose(p, inp, asOf).self;
  console.log(`  ${label.padEnd(34)} verdict=${r.verdict.padEnd(10)} 必要額 ${man(r.range.low)}〜${man(r.range.high)}  (rawNeed ${man(r.rawNeed)})`);
};

console.log("【この世帯の感度：1項目だけ動かす】");
show("そのまま", base);
show("配偶者の就労収入を0にする", { ...base, spouse: { ...base.spouse!, income: 0 } });
show("配偶者の年収 200万→100万", { ...base, spouse: { ...base.spouse!, income: 1_000_000 } });
show("進路を私立中心にする", { ...base, educationPlan: "private" });
show("生活費 28万→35万/月", { ...base, monthlyLiving: 350_000 });
show("団信なしにする", { ...base, housing: { ...base.housing, danshin: false } as typeof base.housing });

console.log("\n【ゴールデン10世帯で ample / not_needed が出る件数】");
let n = 0;
for (const g of GOLDEN) {
  const r = diagnose(p, g.input, asOf);
  if (r.self.verdict === "ample" || r.self.verdict === "not_needed") { n++; console.log("   ", g.id, r.self.verdict); }
}
console.log("   該当:", n, "/", GOLDEN.length);
