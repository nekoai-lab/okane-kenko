/**
 * 必要死亡保障額の算定（機能仕様書 §4.2）
 *
 * ADR-008：算定期間は一律「遺された配偶者が65歳まで」。就業状況で期間を分岐しない
 *          （境界の両側で約1,800万円の崖ができ、正直さとして耐えられないため）。
 *          就業状況の違いは、期間ではなく就労収入の控除額で連続的に反映する。
 * ADR-009：遺族の就労収入は全額差し引く。
 */
import type { EducationParams, ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import { chukoreiKafuTotal, izokuKisoTotal, izokuKoseiAnnual, koseiYears } from "./pension.js";
import type { Assumption, DeathResult, EducationPlan, Household, Verdict } from "./types.js";

function roundToUnit(x: number, unit: number): number {
  return Math.round(x / unit) * unit;
}

/**
 * **判定を支えている前提を、黙って置かない**（2026-09-21 オーナー決定・仕様 §5.3）。
 *
 * 遺族の就労収入は算定期間ぶんを定額で積むため、世帯によっては**これ単独で判定が決まる**。
 * 実測：40歳会社員／配偶者38歳（年収200万）／子2人の世帯で survivorWork は 4,320万円になり、
 * 0 にすると `ample`（必要額200万円）から `shortage`（800〜1,200万円）へ反転する。
 * それだけの重みを持つ前提が、これまで `survivor.income === 0` のときしか画面に出ていなかった。
 *
 * **金額を作っているのがこの層なので、前提の説明もこの層から出す。**
 * 画面側で書くと、式を変えたときに文だけ古いまま残る。
 *
 * ここで返すのは**式の是非ではなく開示**である。逓減係数を入れる案（T-B）は、
 * 係数に公的出典が無く `survivorLivingRatio` 0.70 と同じ問題を再生産するため採らない。
 * 下振れの体験はもしもラボの就労シナリオ（200万継続／100万に減額／就労なし）が担う。
 */
function buildSurvivorAssumptions(
  p: ParamSet,
  x: {
    /** 配偶者がいない世帯では、配偶者にまつわる前提は語らない（無い前提を語らない） */
    hasSurvivor: boolean;
    survivorIncome: number;
    survivorWork: number;
    yTotal: number;
    yAlone: number;
    hasChildren: boolean;
  },
): Assumption[] {
  /**
   * **「配偶者」と書かない。** `calcDeath` は本人死亡と配偶者死亡の両方で呼ばれ、
   * 後者では遺されるのは**本人**なので、「配偶者が働き続ける」は事実と逆になる。
   * この層は誰が遺されるかを知らないので、どちらでも正しい「遺されたご家族」で書く。
   */
  const man = (yen: number) => Math.round(yen / 10000).toLocaleString("ja-JP");
  const out: Assumption[] = [];

  if (x.hasSurvivor && x.survivorIncome > 0) {
    out.push({
      field: "survivor.income.flat",
      value: x.survivorIncome,
      reason: "estimated",
      note: `この判定は、遺されたご家族が働き続ける前提に立っています。65歳になるまでの${x.yTotal}年間、年収${man(x.survivorIncome)}万円を途切れず維持するものとして、合計 約${man(x.survivorWork)}万円を収入に見込みました。昇給も減収も見込んでいません。`,
    });
  }
  if (x.hasSurvivor && x.yAlone > 0) {
    out.push({
      field: "survivor.income.floor",
      value: v(p, "postIndepMinIncome"),
      reason: "estimated",
      note: `この判定は、お子さんの独立後も遺されたご家族の収入が下がらない前提に立っています（年${man(v(p, "postIndepMinIncome"))}万円を下限に置き、いまの収入がそれを上回る場合はいまの収入のままとしています）。`,
    });
  }
  if (x.hasSurvivor) {
    out.push({
        field: "survivor.disability",
      value: "起きない",
      reason: "default",
      // 同じページの「就業不能・障害」の行で診ているリスクを、この計算では起きないものとして扱っている
      note: "この判定は、遺されたご家族自身が病気やけがで働けなくなることは起きない前提に立っています。そのリスクは上の「就業不能・障害」の行で別に診ており、この死亡の計算には含めていません。",
    });
  }
  if (x.hasChildren) {
    out.push({
      field: "childcare.extra",
      value: 0,
      reason: "default",
      note: "この判定は、遺されたご家族が就労を増やす場合の追加の保育費・学童費用を支出に見込んでいません。実際にかかる場合、必要額はこの試算より増えます。",
    });
  }
  out.push({
    field: "assets.growth",
    value: 0,
    reason: "default",
    note: "この判定は、算定期間中に新しく貯蓄が増えることはない前提に立っています。金融資産はいまの額のまま置いています。",
  });
  if (x.hasSurvivor) {
    out.push({
      field: "period.end",
      value: 65,
      reason: "default",
      note: `この判定は、遺されたご家族が65歳になるまでの${x.yTotal}年だけを見ています。65歳以降の生活費はこの計算の対象外です（老齢年金に切り替わるため）。`,
    });
  }
  return out;
}

/**
 * 教育費（§4.2.2・段階別）。子の現年齢から、残りの各年を段階に割り当てて実額を積む。
 * 学習費総額ベース（塾・部活・行事・制服・寄付を含む）。高校は就学支援金を年ごとに控除する。
 * 大学入学料は年額換算に含めて按分済み（4年総額÷4）。地域係数を最後に掛ける。
 */
export function annualEducation(edu: EducationParams, plan: EducationPlan, age: number): number {
  const preset = edu.presets[plan];
  const s = edu.stages;
  if (age >= s.kinder.fromAge && age <= s.kinder.toAge) return s.kinder[preset.kinder];
  if (age >= s.primary.fromAge && age <= s.primary.toAge) return s.primary[preset.primary];
  if (age >= s.junior.fromAge && age <= s.junior.toAge) return s.junior[preset.junior];
  if (age >= s.high.fromAge && age <= s.high.toAge) {
    const shien = preset.high === "public" ? edu.shien.publicHigh : edu.shien.privateHigh;
    return Math.max(0, s.high[preset.high] - shien);
  }
  if (age >= edu.university.fromAge && age <= edu.university.toAge) {
    return edu.university[preset.university];
  }
  return 0;
}

function educationRemaining(edu: EducationParams, plan: EducationPlan, currentAge: number): number {
  let sum = 0;
  for (let a = currentAge; a <= edu.university.toAge; a++) sum += annualEducation(edu, plan, a);
  return sum * edu.regionFactor;
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

  const education = children.reduce(
    (s, age) => s + educationRemaining(p.education, h.educationPlan, age),
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
  /** 判定を支える前提（開示6点）。**`ample` 系に落ちたときだけ結果に載せる** */
  let survivorAssumptions: Assumption[];

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

  survivorAssumptions = buildSurvivorAssumptions(p, {
    hasSurvivor: survivor !== null && survivor !== undefined,
    survivorIncome: survivor?.income ?? 0,
    survivorWork,
    yTotal,
    yAlone,
    hasChildren: children.length > 0,
  });

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
    assumptions.push(...survivorAssumptions);
  } else if (margin > expenseTotal * v(p, "amplemarginRatio")) {
    // 余剰が大きい：上乗せも不要と言い切る（煽らない）
    verdict = "ample";
    low = high = roundToUnit(funeral, unit);
    /**
     * **必要額が葬儀費用の1点に潰れるのはこの枝だけ**なので、
     * 判定を支えている前提をここで開示する（仕様 §5.3・2026-09-21 オーナー決定）。
     * 幅が消えたぶん、前提が外れたときにどう動くかが画面から読めなくなる。
     */
    assumptions.push(...survivorAssumptions);
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
