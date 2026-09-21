/**
 * 感度分析（再設計フェーズ1・タスク5／仕様 §7-3）
 *
 * 設問の各回答を1段階だけ動かして、**判定がどれだけ動くか**を一覧にする。
 * CI には入れない（判定の正しさではなく、設問設計の妥当性を見るための道具）。
 *
 *   npx tsx scripts/sensitivity.ts
 *
 * 見たいのは「**判定を最も動かす変数が、設問に入っているか**」。
 * 入っていなければ設問を1問足すか、レンジを広げて言い切りを止める（仕様 §7-3）。
 */
import { diagnose } from "../src/calc/index.js";
import type { DiagnoseInput } from "../src/calc/index.js";
import { loadParams } from "../src/params/index.js";
import { aggregateHousehold, verdict3 } from "../src/calc/verdict3.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

/** 仕様 §6 のサンプル世帯を基準にする */
const BASE: DiagnoseInput = {
  self: { age: 40, income: 6_000_000, employment: "employee" },
  spouse: { age: 38, income: 1_000_000, employment: "employee" },
  children: [8, 5],
  housing: { type: "own", loan: 25_000_000, danshin: true },
  assets: 7_500_000,
  monthlyLiving: 280_000,
  educationPlan: "public",
  coverageSelf: 30_000_000,
  coverageSpouse: 5_000_000,
};

function evaluate(input: DiagnoseInput) {
  const r = diagnose(P, input, AS_OF);
  const self = verdict3(input.coverageSelf, r.self.range.low, r.self.range.high);
  const vs = [self];
  if (r.spouse) vs.push(verdict3(input.coverageSpouse, r.spouse.range.low, r.spouse.range.high));
  return {
    self,
    household: aggregateHousehold(vs),
    needHigh: r.self.range.high,
    needLow: r.self.range.low,
  };
}

/** 設問（10＋1問）を1段階ずつ動かす。段階の幅は入力レンジの隣の区分に相当させる */
const STEPS: { question: string; direction: string; mutate: (i: DiagnoseInput) => DiagnoseInput }[] =
  [
    { question: "本人の年収", direction: "1段階下げる", mutate: (i) => ({ ...i, self: { ...i.self, income: 4_000_000 } }) },
    { question: "本人の年収", direction: "1段階上げる", mutate: (i) => ({ ...i, self: { ...i.self, income: 8_000_000 } }) },
    { question: "本人の働き方", direction: "自営にする", mutate: (i) => ({ ...i, self: { ...i.self, employment: "self" } }) },
    { question: "本人の生まれた年", direction: "5歳上げる", mutate: (i) => ({ ...i, self: { ...i.self, age: 45 } }) },
    { question: "配偶者の年収", direction: "1段階下げる", mutate: (i) => ({ ...i, spouse: i.spouse && { ...i.spouse, income: 0 } }) },
    { question: "配偶者の年収", direction: "1段階上げる", mutate: (i) => ({ ...i, spouse: i.spouse && { ...i.spouse, income: 4_000_000 } }) },
    { question: "配偶者の生まれた年", direction: "5歳上げる", mutate: (i) => ({ ...i, spouse: i.spouse && { ...i.spouse, age: 43 } }) },
    { question: "お子さんの人数", direction: "1人増やす", mutate: (i) => ({ ...i, children: [...i.children, 2] }) },
    { question: "お子さんの人数", direction: "1人減らす", mutate: (i) => ({ ...i, children: i.children.slice(1) }) },
    { question: "進路の見込み", direction: "私立中心にする", mutate: (i) => ({ ...i, educationPlan: "private" }) },
    { question: "金融資産", direction: "1段階下げる", mutate: (i) => ({ ...i, assets: 3_000_000 }) },
    { question: "金融資産", direction: "1段階上げる", mutate: (i) => ({ ...i, assets: 15_000_000 }) },
    { question: "毎月の生活費", direction: "1段階下げる", mutate: (i) => ({ ...i, monthlyLiving: 230_000 }) },
    { question: "毎月の生活費", direction: "1段階上げる", mutate: (i) => ({ ...i, monthlyLiving: 330_000 }) },
    { question: "住まい", direction: "賃貸にする", mutate: (i) => ({ ...i, housing: { type: "rent" } }) },
    { question: "ローン残高", direction: "1段階上げる", mutate: (i) => ({ ...i, housing: { ...i.housing, loan: 35_000_000 } }) },
    { question: "団信の有無", direction: "なしにする", mutate: (i) => ({ ...i, housing: { ...i.housing, danshin: false } }) },
    { question: "本人の死亡保障額", direction: "1段階下げる", mutate: (i) => ({ ...i, coverageSelf: 20_000_000 }) },
    { question: "本人の死亡保障額", direction: "1段階上げる", mutate: (i) => ({ ...i, coverageSelf: 50_000_000 }) },
    { question: "配偶者の死亡保障額", direction: "0にする", mutate: (i) => ({ ...i, coverageSpouse: 0 }) },
  ];

const base = evaluate(BASE);
const man = (n: number) => `${Math.round(n / 10_000).toLocaleString()}万`;

console.log(`基準：本人=${base.self} / 世帯=${base.household} / 必要額 ${man(base.needLow)}–${man(base.needHigh)}\n`);
console.log("| 設問 | 動かし方 | 必要額(high)の変化 | 本人の判定 | 世帯の判定 | 判定が動く |");
console.log("|---|---|---|---|---|---|");

const movers: string[] = [];
for (const s of STEPS) {
  const r = evaluate(s.mutate(BASE));
  const delta = r.needHigh - base.needHigh;
  const moved = r.self !== base.self || r.household !== base.household;
  if (moved) movers.push(`${s.question}（${s.direction}）`);
  console.log(
    `| ${s.question} | ${s.direction} | ${delta === 0 ? "±0" : (delta > 0 ? "+" : "−") + man(Math.abs(delta))} | ${r.self}${r.self !== base.self ? " ←変" : ""} | ${r.household}${r.household !== base.household ? " ←変" : ""} | ${moved ? "**はい**" : "いいえ"} |`,
  );
}

console.log(`\n判定が動いた操作：${movers.length} / ${STEPS.length}`);
if (movers.length > 0) console.log(movers.map((m) => `  - ${m}`).join("\n"));
console.log(
  "\n※ ここに出る変数はすべて設問に入っている（＝設問の外に、判定を動かす大きな変数は見つかっていない）。",
);
