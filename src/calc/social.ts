/**
 * 制度式モジュール（再設計フェーズ1・タスク1）
 *
 * 「病気・けが」「失業」のシナリオで、**公的なしくみがどこまで受けるか**を出す純粋関数。
 * 仕様 `docs/redesign-spec-2026-09-21.md` §4-3。
 *
 * この層の約束：
 * - **制度の数値は `params/*.yaml` にしか置かない。** ここには式だけを書く
 * - 簡約したところは、**どう簡約したか**と**どちらに倒したか**をコメントに残す
 * - 出せない項目に数字を置かない（呼び出し側が「計算未対応」を出せるように、値ではなく理由を返す）
 */
import type { ParamSet } from "../params/index.js";
import { kogakuCap } from "./medical.js";

/** 1か月を何日として日額に割るか。健康保険の標準報酬は月額なので30日で割る */
const DAYS_PER_MONTH = 30;

const pct = (r: number) => Math.round(r * 100);

export interface SourcedAmount {
  /** 円 */
  amount: number;
  /** 画面に出す根拠（機関名＋制度名） */
  source: string;
  /** 一次情報で未確認なら false */
  verified: boolean;
  /** 計算にあたって置いた前提（結果画面に出す） */
  assumptions: string[];
}

/* ------------------------------------------------------------------ *
 * 高額療養費 ─ 月上限 × 月数（多数回該当つき）
 * ------------------------------------------------------------------ */

/**
 * 療養が `months` か月続いたときの、**自己負担の合計**（高額療養費の上限ベース）。
 *
 * 多数回該当：直近12か月に3回以上上限に達すると、4か月目から上限が下がる。
 * **v1 は「連続して該当する」前提の簡約**で、`multipleOccurrenceFromMonth`（＝4）か月目以降を
 * 減額上限に切り替える。実際の制度は「連続」を要件としないが、長期療養では連続該当が典型で、
 * この簡約は自己負担を**低めに見積もる**方向に働く。
 *
 * **v1 対象外（いずれも自己負担を下げる方向なので、入れないほうが安全側）**：
 * 世帯合算／21,000円ルール／月をまたぐ入院の按分。
 */
export function kogakuBurden(
  p: ParamSet,
  annualIncome: number,
  months: number,
): SourcedAmount & { monthlyCap: number; reducedCap: number | null; category: string } {
  const { name, cap } = kogakuCap(p, annualIncome);
  const reduced = p.kogaku.multipleOccurrence[name];
  const fromMonth = p.kogaku.multipleOccurrenceFromMonth;

  const m = Math.max(0, Math.floor(months));
  const assumptions: string[] = [];
  let amount = 0;

  if (reduced === undefined) {
    // 区分に対応する多数回該当の値が無い（テーブル改定などで起きうる）。
    // **黙って通常上限を使い続けない。** 前提として表に出す。
    amount = cap * m;
    assumptions.push(`${name}の多数回該当の上限が params に無いため、全期間を通常の上限で計算した`);
  } else {
    const normalMonths = Math.min(m, fromMonth - 1);
    const reducedMonths = Math.max(0, m - (fromMonth - 1));
    amount = cap * normalMonths + reduced * reducedMonths;
    if (reducedMonths > 0) {
      assumptions.push(
        `${fromMonth}か月目から多数回該当として上限が下がる前提（連続して該当するものとした）`,
      );
    }
  }

  assumptions.push(
    `月あたりの医療費を${(p.kogaku.assumedMonthlyMedicalCost / 10000).toLocaleString()}万円として上限を計算した`,
    `世帯合算・${p.kogaku.householdAggregationMin.toLocaleString()}円ルールは見込んでいない（自己負担は実際にはこれより下がりうる）`,
  );

  return {
    amount: Math.round(amount),
    monthlyCap: cap,
    reducedCap: reduced ?? null,
    category: name,
    source: `${p.kogaku.source}／${p.kogaku.multipleOccurrenceSource}`,
    verified: p.kogaku.verified && p.kogaku.multipleOccurrenceVerified,
    assumptions,
  };
}

/* ------------------------------------------------------------------ *
 * 健康保険 傷病手当金
 * ------------------------------------------------------------------ */

/**
 * 療養で働けない間に受け取れる見込み額。
 *
 * 支給額 ＝ 標準報酬日額 × 2/3 × 支給日数。待期3日は支給されず、通算1年6か月が上限。
 *
 * **簡約**：標準報酬月額を「年収 ÷ 12」で置く（等級表を引かない）。
 * 等級は幅で刻まれるため実際は上下するが、年収から等級を引く表は params に無い。
 * また**国民健康保険には傷病手当金が無い**ので、自営・フリーランスは 0 を返す。
 */
export function shobyoTeate(
  p: ParamSet,
  input: { annualIncome: number; months: number; employment: "employee" | "self" | "none" },
): SourcedAmount & { dailyAmount: number; paidDays: number } {
  const t = p.shobyoTeate;
  const assumptions: string[] = [];

  if (input.employment !== "employee" || input.annualIncome <= 0) {
    return {
      amount: 0,
      dailyAmount: 0,
      paidDays: 0,
      source: t.source,
      verified: t.verified,
      assumptions: [
        input.employment === "employee"
          ? "収入が0のため支給額を出していない"
          : "国民健康保険には傷病手当金が無いため0円とした（自営・フリーランス・無職）",
      ],
    };
  }

  const monthlyStandard = input.annualIncome / 12;
  const daily = (monthlyStandard / DAYS_PER_MONTH) * t.rate;

  const cappedMonths = Math.min(Math.max(0, input.months), t.maxMonths);
  if (input.months > t.maxMonths) {
    assumptions.push(
      `通算${t.maxMonths}か月で打ち切られる前提（${input.months}か月のうち超過分は0円）`,
    );
  }
  // 待期3日は最初の1回だけ引く（同一傷病で連続して休む前提）
  const paidDays = Math.max(0, cappedMonths * DAYS_PER_MONTH - t.waitingDays);

  assumptions.push(
    "標準報酬月額を年収の12分の1として概算した（等級表は引いていない）",
    `待期${t.waitingDays}日は支給されない`,
  );

  return {
    amount: Math.round(daily * paidDays),
    dailyAmount: Math.round(daily),
    paidDays,
    source: t.source,
    verified: t.verified,
    assumptions,
  };
}

/* ------------------------------------------------------------------ *
 * 雇用保険 基本手当
 * ------------------------------------------------------------------ */

/**
 * 失業したときに受け取れる見込み額。
 *
 * 基本手当日額 ＝ 賃金日額 × 給付率（実際は賃金日額に応じ 50〜80%。60〜64歳のみ 45〜80%）。
 * **v1 は中位の給付率で概算し、年齢別の日額上限で頭打ちにする。**
 *
 * 所定給付日数は**自己都合など一般の受給資格者**の表（加入期間のみで決まる）。
 * 会社都合（特定受給資格者）は年齢×加入期間で最大330日まで伸びるが、
 * **短いほうを使うと公的な支えを少なめに見積もることになり、必要額は安全側（多め）に出る。**
 */
export function kihonTeate(
  p: ParamSet,
  input: { annualIncome: number; age: number; insuredYears: number },
): SourcedAmount & { dailyAmount: number; days: number } {
  const t = p.kihonTeate;
  const assumptions: string[] = [];

  const row = t.daysGeneral.find((d) => input.insuredYears >= d.insuredYearsFrom);
  if (!row || input.annualIncome <= 0) {
    return {
      amount: 0,
      dailyAmount: 0,
      days: 0,
      source: t.source,
      verified: t.verified,
      assumptions: ["雇用保険の加入期間が1年未満のため、基本手当は見込んでいない"],
    };
  }

  const wageDaily = input.annualIncome / 365;
  const capRow = t.dailyCapByAge.find((c) => input.age >= c.fromAge);
  const cap = capRow ? capRow.cap : t.dailyCapByAge[t.dailyCapByAge.length - 1].cap;
  const raw = wageDaily * t.benefitRate;
  const daily = Math.min(raw, cap);

  /**
   * **日額上限を先に出す。** 上限で頭打ちになる世帯では、給付率より上限のほうが額を決めている。
   * 頭打ちにならない世帯でも、上限がいくらかは先に言う（順番が世帯によって変わらないようにする）。
   */
  assumptions.push(
    daily === cap && raw > cap
      ? `年齢${input.age}歳の日額上限（${cap.toLocaleString()}円）で頭打ちにした`
      : `年齢${input.age}歳の日額上限（${cap.toLocaleString()}円）には届いていない`,
  );
  assumptions.push(
    // 帯の値は params（displayOnly）から描く。文に書き写すと改定で黙って古くなる
    `給付率を${pct(t.benefitRate)}%として概算した（実際は賃金日額に応じ${pct(t.benefitRateBandLow)}〜${pct(t.benefitRateBandHigh)}%。60〜64歳のみ${pct(t.benefitRateBandLow60to64)}〜${pct(t.benefitRateBandHigh)}%）`,
    "自己都合など一般の受給資格者の給付日数で計算した（会社都合ならこれより長い）",
  );

  return {
    amount: Math.round(daily * row.days),
    dailyAmount: Math.round(daily),
    days: row.days,
    source: t.source,
    verified: t.verified,
    assumptions,
  };
}
