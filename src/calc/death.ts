/**
 * 必要死亡保障額の算定（機能仕様書 §4.2）
 *
 * ADR-008：算定期間は一律「遺された配偶者が65歳まで」。就業状況で期間を分岐しない
 *          （境界の両側で約1,800万円の崖ができ、正直さとして耐えられないため）。
 *          就業状況の違いは、期間ではなく就労収入の控除額で連続的に反映する。
 * ADR-009：遺族の就労収入は全額差し引く。
 */
import type { ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import { chukoreiKafuTotal, izokuKisoTotal, izokuKoseiAnnual, koseiYears } from "./pension.js";
import type { Assumption, DeathResult, Household, Verdict } from "./types.js";

function roundToUnit(x: number, unit: number): number {
  return Math.round(x / unit) * unit;
}

export function calcDeath(p: ParamSet, h: Household): DeathResult {
  const assumptions: Assumption[] = [];
  const { deceased, survivor, children, housing } = h;

  // ---------- 期間 ----------
  const indepAge = v(p, "childIndepAge");
  const pensionAge = v(p, "pensionAge");
  const yTotal = survivor ? Math.max(0, pensionAge - survivor.age) : 0;
  const yDepRaw = children.length > 0 ? Math.max(0, indepAge - Math.min(...children)) : 0;
  const yDep = Math.min(yDepRaw, yTotal);
  const yAlone = Math.max(0, yTotal - yDep);

  // ---------- 支出 E ----------
  const M = h.monthlyLiving;
  const livingChild = M * v(p, "survivorLivingRatioChild") * 12 * yDep;
  const livingAlone = M * v(p, "survivorLivingRatioAlone") * 12 * yAlone;

  const eduUnit = {
    public: v(p, "educationPublic"),
    mixed: v(p, "educationMixed"),
    private: v(p, "educationPrivate"),
  }[h.educationPlan];
  const education = children.reduce(
    (s, age) => s + (eduUnit * Math.max(0, indepAge - age)) / indepAge,
    0,
  );

  // 団信ありなら住宅ローンは死亡時に消える。「分からない」は true 扱いで、結果に併記する。
  let housingCost = 0;
  if (housing.type === "own" && (housing.loan ?? 0) > 0 && housing.danshin === false) {
    housingCost = housing.loan ?? 0;
  }
  if (housing.type === "own" && (housing.loan ?? 0) > 0 && housing.danshin === undefined) {
    assumptions.push({
      field: "housing.danshin",
      value: "あり",
      reason: "default",
      note: `団信が「分からない」ため、ありとして算定しました。団信がない場合は必要額が約${Math.round(
        (housing.loan ?? 0) / 10000,
      )}万円増えます。`,
    });
  }

  const funeral = v(p, "funeralReserve");
  const expenseTotal = livingChild + livingAlone + education + housingCost + funeral;

  // ---------- 収入・資産 I ----------
  let pensionBasic = 0;
  let pensionKosei = 0;
  let chukoreiKafu = 0;
  let survivorWork = 0;

  if (survivor) {
    pensionBasic = izokuKisoTotal(p, children, yTotal);
    pensionKosei = izokuKoseiAnnual(p, deceased) * koseiYears(p, children.length > 0, yTotal);
    chukoreiKafu = chukoreiKafuTotal(p, survivor, children, yTotal);

    // 就労収入の連続推定（ADR-008）：崖をつくらない
    const netNow = survivor.income * v(p, "netIncomeRatio");
    const netAfter = Math.max(netNow, v(p, "postIndepMinIncome"));
    survivorWork = netNow * yDep + netAfter * yAlone;

    if (survivor.income === 0) {
      assumptions.push({
        field: "survivor.income",
        value: v(p, "postIndepMinIncome"),
        reason: "estimated",
        note: `末子独立後は年${Math.round(
          v(p, "postIndepMinIncome") / 10000,
        )}万円程度の就労収入があるものとして算定しています（当社基準）。`,
      });
    }
  }

  const assets = h.assets;
  const incomeTotal = pensionBasic + pensionKosei + chukoreiKafu + survivorWork + assets;

  // ---------- 必要額・判定 ----------
  const rawNeed = Math.max(0, expenseTotal - incomeTotal);
  const margin = incomeTotal - expenseTotal;
  const unit = v(p, "roundUnit");

  let verdict: Verdict;
  let low: number;
  let high: number;

  if (rawNeed >= v(p, "shortageThreshold")) {
    verdict = "shortage";
    low = roundToUnit(rawNeed * 0.8, unit);
    high = roundToUnit(rawNeed * 1.2, unit);
  } else if (!survivor && children.length === 0) {
    // 扶養家族がいない：上乗せの概念がない
    verdict = "not_needed";
    low = high = roundToUnit(funeral, unit);
  } else if (margin > expenseTotal * v(p, "amplemarginRatio")) {
    // 余剰が大きい：上乗せも不要と言い切る（煽らない）
    verdict = "ample";
    low = high = roundToUnit(funeral, unit);
  } else {
    verdict = "sufficient";
    low = roundToUnit(funeral + M * v(p, "survivorLivingRatioChild") * 12, unit);
    high = roundToUnit(funeral + M * v(p, "survivorLivingRatioChild") * 24, unit);
  }

  // ---------- 現在の保障との比較 ----------
  let gap: DeathResult["gap"];
  if (h.currentCoverage === null) {
    gap = { kind: "pending", amount: 0 };
    assumptions.push({
      field: "currentCoverage",
      value: "unknown",
      reason: "unknown",
      note: "現在の保険内容が未入力のため、過不足の判定は保留しています。証券が見つかったら再診断できます。",
    });
  } else if (h.currentCoverage < low) {
    gap = { kind: "shortage", amount: low - h.currentCoverage };
  } else if (h.currentCoverage > high * 1.5) {
    gap = { kind: "excess", amount: h.currentCoverage - high };
  } else {
    gap = { kind: "adequate", amount: 0 };
  }

  return {
    expense: {
      livingChild,
      livingAlone,
      education,
      housing: housingCost,
      funeral,
      total: expenseTotal,
    },
    income: {
      pensionBasic,
      pensionKosei,
      chukoreiKafu,
      survivorWork,
      assets,
      total: incomeTotal,
    },
    years: { dependent: yDep, alone: yAlone, total: yTotal },
    rawNeed,
    margin,
    range: { low, high },
    verdict,
    gap,
    assumptions,
  };
}
