/**
 * 「検証版です」の告知と、本番ゲート（strictVerified）が**同じ判定を使う**ことを固定する。
 *
 * ここがずれると、静かに壊れる：
 * - 全部 verified になったのにバナーが残る → 嘘の注意書きが出続ける
 * - 未確認が残っているのにバナーが消える → 確定値だと思われたまま持ち帰られる
 *
 * どちらもエラーを出さないので、このテスト以外に気づく手段がない。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { diagnose } from "../calc/index.js";
import { needForSickness } from "../calc/scenarios.js";
import { simulate } from "../calc/simulate.js";
import { ownStandardValueText } from "./display.js";
import { assertUsable, loadParams, type ParamSet, unverifiedKeys } from "./index.js";

/** 有効期間内の日付を使う（期限切れで落ちると、確認したい等価性が見えなくなる） */
function withinValidity(effectiveTo: string): Date {
  return new Date(`${effectiveTo}T00:00:00+09:00`);
}

describe("未確認パラメータの判定", () => {
  it("unverifiedKeys が空でないときだけ、strictVerified は診断を止める", () => {
    const p = loadParams();
    const asOf = withinValidity(p.effectiveTo);

    const hasUnverified = unverifiedKeys(p).length > 0;
    let stopped = false;
    try {
      assertUsable(p, asOf, { strictVerified: true });
    } catch {
      stopped = true;
    }

    expect(stopped).toBe(hasUnverified);
  });

  it("すべて verified にすると、告知も本番ゲートも消える", () => {
    const p = structuredClone(loadParams());
    for (const e of Object.values(p.public)) e.verified = true;
    for (const e of Object.values(p.toBeSourced)) e.verified = true;
    p.education.university.verified = true;
    p.education.shien.verified = true;

    expect(unverifiedKeys(p)).toEqual([]);
    expect(() =>
      assertUsable(p, withinValidity(p.effectiveTo), { strictVerified: true }),
    ).not.toThrow();
  });

  it("1つでも verified:false があれば、告知は出るし本番ゲートも止める", () => {
    const p = structuredClone(loadParams());
    for (const e of Object.values(p.public)) e.verified = true;
    for (const e of Object.values(p.toBeSourced)) e.verified = true;
    p.education.university.verified = true;
    p.education.shien.verified = false; // 1つだけ戻す

    expect(unverifiedKeys(p)).toContain("education.shien");
    expect(() =>
      assertUsable(p, withinValidity(p.effectiveTo), { strictVerified: true }),
    ).toThrow();
  });
});

/**
 * **当社基準の在庫が、実際に使われている値とずれないこと**（2026-09-21）
 *
 * `fallbackFinancialAssets` と `livingCostEstimateRatio` は
 * 「公的出典のない当社基準」の一覧に載せるために置いた行で、
 * **値そのものは別の場所（`inputRanges` / 算定側）が持っている**。
 *
 * 在庫と正本を2か所に書いた瞬間、片方だけ直して**一覧のほうが静かに古くなる**。
 * それは「当社基準を全部並べて見せる」という約束を、エラーを出さずに破る壊れ方なので、
 * ここで等式を固定する（`funeralFloorRule` が額を `toBeSourced` に残しているのと同じ理由）。
 */
describe("当社基準の在庫と、実際に使う値が一致する", () => {
  it("fallbackFinancialAssets ＝ inputRanges.assets.unknown", () => {
    const p = loadParams();
    expect(p.ownStandard.fallbackFinancialAssets.value).toBe(p.inputRanges.assets.unknown);
  });

  /**
   * **同じ行を2回出さない**（2026-09-22）。旧キー `livingCostFromIncome` を別名で残していたため、
   * 画面の一覧に同じ行が2回出て「全16件」の件数が嘘になっていた。別名は消し、参照を付け替えた。
   */
  it("在庫のラベルは重複しない（一覧の件数が実数と一致する）", () => {
    const p = loadParams();
    const labels = Object.values(p.ownStandard).map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("在庫のラベルに Markdown の強調記号を入れない（画面にそのまま出る）", () => {
    const p = loadParams();
    for (const e of Object.values(p.ownStandard)) expect(e.label).not.toContain("*");
  });

  it("在庫はすべて単位を持ち、値を画面の文字列にできる（単位の無い数字を出さない）", () => {
    const p = loadParams();
    for (const e of Object.values(p.ownStandard))
      expect(() => ownStandardValueText(e)).not.toThrow();
    expect(ownStandardValueText(p.ownStandard.survivorLivingRatioChild)).toBe("0.7倍");
    expect(ownStandardValueText(p.ownStandard.fallbackFinancialAssets)).toBe("300万円");
    expect(ownStandardValueText(p.ownStandard.postIndepMinIncome)).toBe("年100万円");
    expect(ownStandardValueText(p.ownStandard.sufficientTopUpMonthsHigh)).toBe("24か月");
    expect(ownStandardValueText(p.ownStandard.lifestyleDialMultipliers)).toBe("0.9倍／1倍／1.1倍");
    expect(ownStandardValueText(p.ownStandard.funeralFloorRule)).toBeNull();
  });

  it("**掛ける相手は手取り**であることがラベルに書いてある（年収と読めるラベルにしない）", () => {
    const p = loadParams();
    expect(p.ownStandard.livingCostEstimateRatio.label).toContain("手取り");
  });
});

/**
 * **在庫を動かしたら結果が動く ＝ コードに同じ数字が直書きで残っていない**（2026-09-22 掃引）。
 *
 * 下の値は在庫（`ownStandard`）が唯一の置き場で、算定側は `v()` で読むだけにした。
 * 上の「在庫＝正本」の等式は、正本が2か所にあるときの型。ここは正本が1か所なので、
 * **在庫を書き換えると出力が変わること**で、直書きが戻っていないことを固定する。
 * 直書きに戻すと在庫だけが動き、出力は黙って元のまま ── それを検出する。
 */
describe("当社基準の在庫を動かすと、算定結果が動く（直書きが残っていない）", () => {
  const AS_OF = new Date("2026-09-22T00:00:00+09:00");
  const gt = (id: string) => {
    const g = GOLDEN.find((x) => x.id === id);
    if (!g) throw new Error(id);
    return g.input;
  };
  const withOwn = (key: string, value: number): ParamSet => {
    const p = structuredClone(loadParams());
    p.ownStandard[key] = { ...p.ownStandard[key], value };
    return p;
  };

  it("shortageRangeLowFactor / HighFactor が shortage 枝の幅を決める（GT-02 本人）", () => {
    const base = diagnose(loadParams(), gt("GT-02"), AS_OF).self;
    expect(base.verdict).toBe("shortage");
    const lo = diagnose(withOwn("shortageRangeLowFactor", 0.5), gt("GT-02"), AS_OF).self;
    const hi = diagnose(withOwn("shortageRangeHighFactor", 2), gt("GT-02"), AS_OF).self;
    expect(lo.range.low).toBeLessThan(base.range.low);
    expect(hi.range.high).toBeGreaterThan(base.range.high);
  });

  it("sufficientTopUpMonthsLow / High が sufficient 枝の幅を決める（GT-07 本人）", () => {
    const base = diagnose(loadParams(), gt("GT-07"), AS_OF).self;
    expect(base.verdict).toBe("sufficient");
    const lo = diagnose(withOwn("sufficientTopUpMonthsLow", 1), gt("GT-07"), AS_OF).self;
    const hi = diagnose(withOwn("sufficientTopUpMonthsHigh", 60), gt("GT-07"), AS_OF).self;
    expect(lo.range.low).toBeLessThan(base.range.low);
    expect(hi.range.high).toBeGreaterThan(base.range.high);
  });

  it("excessCoverageRatio が excess / adequate の境目を決める（GT-01 本人）", () => {
    const base = diagnose(loadParams(), gt("GT-01"), AS_OF).self;
    expect(base.gap.kind).toBe("excess");
    // 保障2,000万 ÷ 上端200万 ＝ 10倍。境目を20倍にすれば excess ではなくなる
    const moved = diagnose(withOwn("excessCoverageRatio", 20), gt("GT-01"), AS_OF).self;
    expect(moved.gap.kind).toBe("adequate");
  });

  it("前提の見出し語も在庫から描く（保険外の月額・算定期間の終わり）", () => {
    const p = structuredClone(loadParams());
    p.toBeSourced.uncoveredMedicalMonthly = {
      ...p.toBeSourced.uncoveredMedicalMonthly,
      value: 50000,
    };
    const input = {
      annualIncome: 5_000_000,
      employment: "employee" as const,
      monthlyLiving: 300_000,
      age: 40,
      insuredYears: 10,
    };
    const s = needForSickness(p, input, 3, "one_month");
    expect(s.premises.map((x) => x.label)).toContain("保険外の自己負担は月5万円");

    const q = structuredClone(loadParams());
    q.constants.pensionAge = 70;
    const d = diagnose(q, gt("GT-01"), AS_OF).self;
    const end = d.assumptions.find((a) => a.field === "period.end");
    expect(end?.label).toBe("対象は70歳まで");
    expect(end?.value).toBe(70);
  });

  it("workStartAge が失業の加入年数と開示文を決める（計算と文の両方）", () => {
    const base = simulate(loadParams(), { answers: gt("GT-01"), asOf: AS_OF }, "unemployment");
    const moved = simulate(
      withOwn("workStartAge", 30),
      { answers: gt("GT-01"), asOf: AS_OF },
      "unemployment",
    );
    expect(base.premises.map((x) => x.note).join()).toContain("22歳就業開始");
    expect(moved.premises.map((x) => x.note).join()).toContain("30歳就業開始");
    expect(moved.assumptions.join()).toContain("30歳就業開始");
    // 加入年数が短くなると給付日数が減り、必要額は動く
    expect(moved.amounts).not.toEqual(base.amounts);
  });
});
