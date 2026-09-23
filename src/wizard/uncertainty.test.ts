/**
 * 入力の不確かさをエンジンに通す（T-H）の検査。
 *
 * ここが守るのは3つ。
 * 1. **方向表のとおりに端が作られる**（緩め端が必要額を減らす側・厳しめ端が増やす側）
 * 2. **端で判定が変わっても幅が潰れない**（包絡を取る）
 * 3. **未回答には幅を作らない**（区分が無いので、勝手に当社基準を増やさない）
 */
import { describe, expect, it } from "vitest";
import { crossingNote, envelope } from "../calc/envelope.js";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import type { WizardSelections } from "./types.js";
import { normalizeEnds } from "./uncertainty.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

/** 子2人・専業主婦・賃貸。生活費は区分で回答（＝連動しない） */
const BASE: WizardSelections = {
  selfBirthYear: 1988,
  selfEmployment: "employee",
  selfIncome: "lt600",
  hasSpouse: true,
  spouseBirthYear: 1991,
  spouseEmployment: "none",
  spouseIncome: "none",
  childrenBirthYears: [2021, 2024],
  educationPlan: "public",
  assets: "lt300",
  livingCost: "lt30",
  housing: "rent",
  coverageSelf: "m1000",
  coverageSpouse: "none",
};

const needOf = (input: Parameters<typeof diagnose>[1]) => diagnose(P, input, AS_OF).self.rawNeed;

describe("方向表：緩め端は必要額を減らし、厳しめ端は増やす", () => {
  it("回答帯の端が入力に反映される（年収・生活費・資産）", () => {
    const e = normalizeEnds(P, BASE, AS_OF);
    // 年収 lt600 ＝ 400〜600万。**緩め端は上端**（遺族厚生年金が増えて必要額が減る）
    expect(e.loose.self.income).toBe(6_000_000);
    expect(e.strict.self.income).toBe(4_000_000);
    // 生活費 lt30 ＝ 25〜30万。**緩め端は下端**
    expect(e.loose.monthlyLiving).toBe(250_000);
    expect(e.strict.monthlyLiving).toBe(300_000);
    // 資産 lt300 ＝ 100〜300万。**緩め端は上端**
    expect(e.loose.assets).toBe(3_000_000);
    expect(e.strict.assets).toBe(1_000_000);
  });

  it("**実際に緩め端 ≦ 点 ≦ 厳しめ端**（方向表が実測と合っている）", () => {
    const e = normalizeEnds(P, BASE, AS_OF);
    const loose = needOf(e.loose);
    const point = needOf(e.point.input);
    const strict = needOf(e.strict);
    expect(loose).toBeLessThanOrEqual(point);
    expect(point).toBeLessThanOrEqual(strict);
    // 幅が本当に生まれている（点のままなら T-H の意味が無い）
    expect(strict).toBeGreaterThan(loose);
  });

  it("包絡したレンジは、点のレンジを内側に含む", () => {
    const e = normalizeEnds(P, BASE, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    const point = diagnose(P, e.point.input, AS_OF).self;
    expect(r.low).toBeLessThanOrEqual(point.range.low);
    expect(r.high).toBeGreaterThanOrEqual(point.range.high);
  });
});

describe("連動：生活費を年収から推定した世帯", () => {
  const ESTIMATE: WizardSelections = { ...BASE, livingCost: "estimate" };

  it("年収の端に生活費が連動する（年収が高い端では生活費も高い）", () => {
    const e = normalizeEnds(P, ESTIMATE, AS_OF);
    // 緩め端＝年収の上端なので、そこから出る生活費も高いほうになる
    expect(e.loose.self.income).toBe(6_000_000);
    expect(e.loose.monthlyLiving).toBeGreaterThan(e.strict.monthlyLiving);
  });

  it("**単調と言い切れないので、年収を逆向きにした候補も混ぜる**", () => {
    const e = normalizeEnds(P, ESTIMATE, AS_OF);
    expect(e.extra).toHaveLength(2);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    // 4候補すべてが包絡の内側にある
    for (const end of r.ends) {
      expect(end.low).toBeGreaterThanOrEqual(r.low);
      expect(end.high).toBeLessThanOrEqual(r.high);
    }
  });

  it("区分で答えた世帯では、逆向きの候補は作らない（2回で足りる）", () => {
    expect(normalizeEnds(P, BASE, AS_OF).extra).toHaveLength(0);
  });
});

describe("枝跨ぎ：端で判定が変わっても幅が潰れない", () => {
  /**
   * **GT-08 相当の世帯**（夫35・年収400万台／妻33・パート／子1人／賃貸／貯蓄少）。
   * 2026-09-23 の実測で、生活費を ±2.5万/月 動かすと
   * `sufficient` 400〜600万 ⇄ `shortage` 300〜400万 を跨ぐことが分かっている。
   * 素直につなぐと 400〜400万に潰れるので、**包絡で防ぐ**ことをここで固定する。
   */
  const GT08: WizardSelections = {
    selfBirthYear: 1991,
    selfEmployment: "employee",
    selfIncome: "lt400",
    hasSpouse: true,
    spouseBirthYear: 1993,
    spouseEmployment: "employee",
    spouseIncome: "lt400",
    childrenBirthYears: [2023],
    educationPlan: "public",
    assets: "lt100",
    livingCost: "lt30",
    housing: "rent",
    coverageSelf: "m500",
    coverageSpouse: "none",
  };

  it("判定が跨いだら crossed になり、レンジは両端の包絡になる", () => {
    const e = normalizeEnds(P, GT08, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    if (!r.crossed) {
      // 跨がない世帯でも包絡の性質は保つ（幅が潰れない）
      expect(r.low).toBeLessThanOrEqual(r.high);
      return;
    }
    expect(r.verdictLoose).not.toBe(r.verdictStrict);
    // **素直につないだ場合（緩め端の low 〜 厳しめ端の high）より広い**
    const naive = { low: r.ends[0].low, high: r.ends[1].high };
    expect(r.low).toBeLessThanOrEqual(naive.low);
    expect(r.high).toBeGreaterThanOrEqual(naive.high);
    expect(r.high).toBeGreaterThanOrEqual(r.low);
  });

  it("判定が跨いだときは文が出る／跨がないときは出さない", () => {
    const crossed = {
      low: 0,
      high: 0,
      verdictLoose: "sufficient" as const,
      verdictStrict: "shortage" as const,
      crossed: true,
      ends: [],
    };
    expect(crossingNote(crossed)).toContain("結論が変わります");
    // **数値は書かない**（金額は画面が算定結果から描く）
    expect(crossingNote(crossed)).not.toMatch(/[0-9]/);
    expect(crossingNote({ ...crossed, crossed: false })).toBeNull();
  });
});

describe("未回答には幅を作らない（区分が無いので）", () => {
  it("「答えたくない」「分からない」は点のまま、かつ黙って落とさない", () => {
    const e = normalizeEnds(
      P,
      { ...BASE, selfIncome: "prefer_not", assets: "unknown", educationPlan: "undecided" },
      AS_OF,
    );
    // 点と同じ値（幅を作っていない）
    expect(e.loose.self.income).toBe(e.point.input.self.income);
    expect(e.strict.assets).toBe(e.point.input.assets);
    // 幅を作れなかったことが残る
    expect(e.pointOnly).toContain("ご本人の年収（答えたくない）");
    expect(e.pointOnly).toContain("金融資産（分からない）");
    expect(e.pointOnly).toContain("お子さんの進路（まだ決めていない）");
    // 幅を持てた入力の一覧には入らない
    expect(e.fields.map((f) => f.field)).not.toContain("selfIncome");
  });

  it("開いた区分（gte）は上端が無いので、その側は点のまま", () => {
    const e = normalizeEnds(P, { ...BASE, selfIncome: "gte1000" }, AS_OF);
    expect(e.strict.self.income).toBe(10_000_000); // 下端はある
    expect(e.loose.self.income).toBe(e.point.input.self.income); // 上端は無い＝点
  });
});
