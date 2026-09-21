/**
 * 死亡以外のシナリオの必要額（再設計フェーズ2・ステップ1）
 *
 * 仕様 `docs/redesign-spec-2026-09-21.md` §4 / §5.3。
 * パイプラインは死亡と同じ3段：①何が起きるか →②公的なしくみがどこまで受けるか →③残りを何で受けるか。
 * **変わるのは②の制度テーブルだけ**なので、ここは `social.ts` の制度式を組み合わせるだけにする。
 *
 * この層の約束：
 * - **金額はここと `src/calc` でしか作らない。** 画面はこの戻り値を描くだけ
 * - **レンジで返す。** 点で返すと、幅のある前提を1つの数字に潰したことが見えなくなる
 * - 簡約は `assumptions[]` に全部出す（画面に出せる形にしておく）
 */
import type { ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import { kihonTeate, kogakuBurden, shobyoTeate } from "./social.js";
import type { Employment } from "./types.js";

/** 1か月を30日として日額に割る（健康保険の標準報酬が月額のため） */
const DAYS_PER_MONTH = 30;

/**
 * 前提の1項目。**見出し語は拾い読みのため**（CLAUDE.md「開示の見せ方」）。
 * 判定を左右するものにだけ付け、残りは本文だけで並べる。
 */
export interface ScenarioPremise {
  label?: string;
  note: string;
}

export interface ScenarioNeed {
  /** 必要額のレンジ（円） */
  low: number;
  high: number;
  /** 何をどう見込んだか。画面にそのまま出す */
  assumptions: string[];
  /**
   * 折りたたみに出す完全な記録（見出し語つき）。
   * **判定を左右する3点には見出し語を付ける**
   * ── 保険外10万円／雇用保険の加入年数の推定／再就職までの期間。
   */
  premises: ScenarioPremise[];
  /** 出典（機関名＋制度名） */
  sources: string[];
}

export interface ScenarioInput {
  annualIncome: number;
  employment: Employment;
  /** 世帯の毎月の生活費（円） */
  monthlyLiving: number;
  age: number;
  /** 雇用保険の加入年数 */
  insuredYears: number;
}

/**
 * 病気・けがで働けない期間の必要額。
 *
 * **レンジの作り方**：
 * - `low` … 医療費の自己負担だけを見込む（高額療養費の上限 × 月数）。**いちばん軽く済んだ場合**
 * - `high` … そこに保険外の自己負担（差額ベッド・交通費など）と、
 *   傷病手当金で埋まらない収入の減少を足す。**重なったときの姿**
 *
 * 幅そのものが「ここは確かなことが言えない」という表示になる。点で出さない。
 */
export function needForSickness(p: ParamSet, input: ScenarioInput, months: number): ScenarioNeed {
  const kogaku = kogakuBurden(p, input.annualIncome, months);
  const uncovered = v(p, "uncoveredMedicalMonthly") * months;

  // 収入の減少。会社員は傷病手当金が埋めるぶんを差し引く（国保には無い）
  const netMonthly = (input.annualIncome / 12) * v(p, "netIncomeRatio");
  const teate = shobyoTeate(p, {
    annualIncome: input.annualIncome,
    months,
    employment: input.employment === "employee" ? "employee" : "self",
  });
  const teateMonthly = months > 0 ? teate.amount / months : 0;
  const incomeLoss = Math.max(0, netMonthly - teateMonthly) * months;

  const assumptions = [
    ...kogaku.assumptions,
    `働けない期間を${months}か月として計算した`,
    `保険外の自己負担（差額ベッド・交通費など）を月${(v(p, "uncoveredMedicalMonthly") / 10000).toLocaleString()}万円と見込んだ（当社基準・公的出典なし）`,
    ...teate.assumptions,
    "幅の下端は医療費の自己負担だけ、上端は保険外の負担と収入の減少まで見込んだもの",
  ];

  return {
    low: Math.round(kogaku.amount),
    high: Math.round(kogaku.amount + uncovered + incomeLoss),
    assumptions,
    premises: [
      {
        // **上端の4割前後をこの1項目が作る。** 公的出典が無いので、必ず見出し語を付けて前に出す
        label: "保険外の自己負担は月10万円",
        note: `差額ベッド・交通費などを月${(v(p, "uncoveredMedicalMonthly") / 10000).toLocaleString()}万円と置いた扱いです（当社基準・公的出典なし）。実際が少なければ必要額は減ります。`,
      },
      {
        label: `働けない期間は${months}か月`,
        note: "これより長引けば、必要額はこの試算より増えます。",
      },
      ...kogaku.assumptions.map((note) => ({ note })),
      ...teate.assumptions.map((note) => ({ note })),
      { note: "幅の下端は医療費の自己負担だけ、上端は保険外の負担と収入の減少まで見込んだものです。" },
    ],
    sources: [kogaku.source, teate.source],
  };
}

/**
 * 失業したときの必要額。
 *
 * **レンジの作り方**（離職理由が分からないので、両端を理由の違いで作る）：
 * - `low` … 会社都合を想定。**給付制限が無い**ので、給付期間中の不足だけ
 * - `high` … 自己都合を想定。**給付制限の2か月は無収入**なので、その生活費が乗る
 *
 * 仕様 §5.3 のとおり、**ここは保険で備える領域ではない**（基本手当と生活防衛資金で受ける）。
 */
export function needForUnemployment(p: ParamSet, input: ScenarioInput): ScenarioNeed {
  const teate = kihonTeate(p, {
    annualIncome: input.annualIncome,
    age: input.age,
    insuredYears: input.insuredYears,
  });

  const benefitMonths = teate.days / DAYS_PER_MONTH;
  const benefitMonthly = teate.dailyAmount * DAYS_PER_MONTH;
  // 給付期間中、基本手当で足りないぶん
  const gapDuringBenefit = Math.max(0, input.monthlyLiving - benefitMonthly) * benefitMonths;
  // 自己都合なら、給付制限のあいだは丸ごと貯蓄で受ける
  const restriction = p.kihonTeate.restrictionMonthsVoluntary;
  const gapDuringRestriction = input.monthlyLiving * restriction;

  return {
    low: Math.round(gapDuringBenefit),
    high: Math.round(gapDuringBenefit + gapDuringRestriction),
    assumptions: [
      ...teate.assumptions,
      `所定給付日数${teate.days}日（約${Math.round(benefitMonths)}か月）を受け取る前提`,
      `幅の下端は会社都合（給付制限なし）、上端は自己都合（給付制限${restriction}か月は無収入）を想定した`,
      "再就職までの期間は給付日数と同じと置いた（それより長引く場合は足りない）",
    ],
    premises: [
      {
        // **設問に無い値を年齢から推定している。** 給付日数がこれで決まるので前に出す
        label: `雇用保険の加入年数は${input.insuredYears}年と推定`,
        note: "設問に無いため、22歳就業開始として年齢から置いた扱いです。実際が短ければ給付日数が減り、必要額は増えます。",
      },
      {
        label: `再就職までは${Math.round(benefitMonths)}か月`,
        note: `所定給付日数${teate.days}日と同じ期間で再就職する扱いです。長引けば、その分だけ必要額は増えます。`,
      },
      {
        label: `給付制限は${restriction}か月で計算（改正の反映は準備中）`,
        // **黙って旧値で出さない。** 改正を知っていて未反映であることを、利用者に先に言う
        note: `幅の下端は会社都合（給付制限なし）、上端は自己都合を想定した扱いです。2025年4月の改正で原則1か月に短縮されていますが、この試算はまだ${restriction}か月で計算しています（反映後は上端が下がります）。`,
      },
      ...teate.assumptions.map((note) => ({ note })),
    ],
    sources: [teate.source],
  };
}
