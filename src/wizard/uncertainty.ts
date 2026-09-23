/**
 * 入力の不確かさをエンジンに通す（T-H・2026-09-23）。
 *
 * **未回答を1つの数字で決めつけない。** 回答帯（区分の上下端）を
 * 「必要額を減らす端（**緩め端**）」と「増やす端（**厳しめ端**）」に振り分け、
 * それぞれの前提一式で `normalize` を回して**2つの入力**を作る。
 * エンジンは点計算のままで、幅は入力側から来る。
 *
 * **方向表は2回で済ませるための最適化であって、正しさの根拠ではない**（2026-09-23 オーナー裁定）。
 * 方向が単調と言い切れない入力（下の「連動」）は、その入力だけ**両方向に動かして包絡**を取る。
 *
 * ## 方向表
 *
 * | 入力 | 緩め端（必要額を減らす） | 厳しめ端（増やす） | 連動 | 出どころ |
 * |---|---|---|---|---|
 * | 本人の年収 | 帯の上端 | 帯の下端（いちばん下の区分は**床**＝`ownStandard.incomeBandFloor`） | **生活費が「年収から推定」のとき連動** | `inputRanges.incomeBand` |
 * | 配偶者の年収 | 帯の上端 | 帯の下端 | 同上 | 同上 |
 * | 生活費（区分で回答） | 帯の下端 | 帯の上端 | ─ | `inputRanges.monthlyLivingBand`（D-01） |
 * | 生活費（年収から推定） | 年収の端から算出 | 年収の端から算出 | **連動する** | §4.2.1 の式 |
 * | 金融資産 | 帯の上端 | 帯の下端 | ─ | `inputRanges.assetsBand` |
 * | 住宅ローン残高 | 帯の下端 | 帯の上端 | 団信ありなら効かない | `inputRanges.loanBand` |
 * | 進路「まだ決めていない」 | **点のまま** | **点のまま** | ─ | **未決**（下記） |
 * | 現在の保障「分からない」 | ─ | ─ | ─ | 必要額に効かない（過不足が `pending` になるだけ） |
 *
 * **未回答（「答えたくない」「分からない」）には区分が無いので、ここでは幅を作らない。**
 * 幅を置くと**新しい当社基準が1つ増える**（T-H の未決）。決まるまで点のまま扱い、
 * 「幅で計算した」と言わない。約束を実装より先に広げないため。
 */
import type { DiagnoseInput } from "../calc/index.js";
import type { AnswerBand, ParamSet } from "../params/index.js";
import { diagnose } from "../calc/index.js";
import {
  ASSETS_LABEL,
  INCOME_LABEL,
  labelOf,
  LIVING_LABEL,
  LOAN_LABEL,
  SPOUSE_INCOME_LABEL,
} from "./labels.js";
import { normalize } from "./normalize.js";
import type { NormalizedInput, WizardSelections } from "./types.js";

/** 必要額を減らす側が `loose`、増やす側が `strict` */
export type End = "loose" | "strict";

export interface UncertainField {
  field: string;
  label: string;
  /** その端で使った値（円） */
  loose: number;
  strict: number;
}

export interface Ends {
  /** 回答どおりの点（いまの画面が使っている入力） */
  point: NormalizedInput;
  /** 必要額を減らす端の入力 */
  loose: DiagnoseInput;
  /** 必要額を増やす端の入力 */
  strict: DiagnoseInput;
  /**
   * **方向が単調と言い切れない組み合わせ**の入力（2026-09-23 裁定）。
   * 年収は「上げると遺族年金が増えて必要額が減る」が、
   * **生活費を年収から推定している世帯では支出も同時に上がる**。
   * どちらが勝つかは世帯による（GT-02 では年金が勝つ）ので、
   * **年収だけ逆向きに動かした入力も候補に混ぜて包絡を取る**
   */
  extra: DiagnoseInput[];
  /** 幅を持てた入力（画面の開示に使う）。**未回答はここに入らない** */
  fields: UncertainField[];
  /** 幅を作れなかった不確かさ（未回答）。**「幅で計算した」と言わないために残す** */
  pointOnly: string[];
}

/**
 * 帯の端。
 *
 * **上が開いている区分（`gte*`）には上端が無い**ので、その側は点に落とす（無い数字を作らない）。
 * **下が開いている区分（いちばん下の区分）には床を置く**（2026-09-23 オーナー裁定）。
 * 端を消すと厳しめ側の不確かさが見えなくなり、**分からない人ほど幅が狭く安心に見える**ため。
 * 床の値は当社基準の在庫 `ownStandard.incomeBandFloor`（数字を2か所に持たない）。
 */
function bandEnd(
  band: AnswerBand | undefined,
  end: End,
  fallback: number,
  floor?: number,
): number {
  if (!band) return fallback;
  if (end === "loose") return band.high ?? fallback;
  return band.low ?? floor ?? fallback;
}

/** 生活費の端（区分で答えた場合）。緩め＝下端・厳しめ＝上端 */
function livingEnd(band: AnswerBand | undefined, end: End, fallback: number): number {
  if (!band) return fallback;
  if (end === "loose") return band.low ?? fallback;
  return band.high ?? fallback;
}

/**
 * 片方の端の入力を作る。
 *
 * **`normalize` を書き換えない。** 区分コードから点を作る道は1つのままにして、
 * ここは「その点を帯の端に差し替える」層として重ねる（写しを2本にしない）。
 */
function atEnd(
  p: ParamSet,
  sel: WizardSelections,
  asOf: Date,
  end: End,
  opts: { flipIncome?: boolean } = {},
): { input: DiagnoseInput; fields: UncertainField[] } {
  const base = normalize(p, sel, asOf);
  const fields: UncertainField[] = [];
  const incomeEnd: End = opts.flipIncome ? (end === "loose" ? "strict" : "loose") : end;

  const floor = p.ownStandard.incomeBandFloor.value;
  const selfIncome = bandEnd(
    p.inputRanges.incomeBand[sel.selfIncome],
    incomeEnd,
    base.input.self.income,
    floor,
  );
  const spouseCode = sel.spouseIncome;
  const spouseIncome =
    base.input.spouse && spouseCode
      ? bandEnd(p.inputRanges.incomeBand[spouseCode], incomeEnd, base.input.spouse.income, floor)
      : (base.input.spouse?.income ?? 0);

  // 生活費：区分で答えたなら帯の端。年収から推定なら**年収の端に連動させて**組み直す
  let monthlyLiving: number;
  if (sel.livingCost === "estimate") {
    const household = selfIncome + (base.input.spouse ? spouseIncome : 0);
    const net = household * p.ownStandard.netIncomeRatio.value;
    monthlyLiving = Math.round((net * p.ownStandard.livingCostEstimateRatio.value) / 12);
  } else {
    monthlyLiving = livingEnd(
      p.inputRanges.monthlyLivingBand[sel.livingCost],
      end,
      base.input.monthlyLiving,
    );
  }

  let housing = base.input.housing;
  if (housing.type === "own" && sel.loan && housing.loan) {
    const loan = livingEnd(p.inputRanges.loanBand[sel.loan], end, housing.loan);
    housing = { ...housing, loan };
  }

  const assets = bandEnd(p.inputRanges.assetsBand[sel.assets], end, base.input.assets);

  if (p.inputRanges.incomeBand[sel.selfIncome]) {
    fields.push({
      field: "selfIncome",
      label: "ご本人の年収",
      loose: bandEnd(p.inputRanges.incomeBand[sel.selfIncome], "loose", base.input.self.income),
      strict: bandEnd(
        p.inputRanges.incomeBand[sel.selfIncome],
        "strict",
        base.input.self.income,
        floor,
      ),
    });
  }
  if (p.inputRanges.monthlyLivingBand[sel.livingCost]) {
    fields.push({
      field: "monthlyLiving",
      label: "毎月の生活費",
      loose: livingEnd(
        p.inputRanges.monthlyLivingBand[sel.livingCost],
        "loose",
        base.input.monthlyLiving,
      ),
      strict: livingEnd(
        p.inputRanges.monthlyLivingBand[sel.livingCost],
        "strict",
        base.input.monthlyLiving,
      ),
    });
  }
  if (p.inputRanges.assetsBand[sel.assets]) {
    fields.push({
      field: "assets",
      label: "金融資産",
      loose: bandEnd(p.inputRanges.assetsBand[sel.assets], "loose", base.input.assets),
      strict: bandEnd(p.inputRanges.assetsBand[sel.assets], "strict", base.input.assets),
    });
  }

  return {
    input: {
      ...base.input,
      self: { ...base.input.self, income: selfIncome },
      spouse: base.input.spouse ? { ...base.input.spouse, income: spouseIncome } : null,
      monthlyLiving,
      assets,
      housing,
    },
    fields,
  };
}

/** 未回答（区分が無いので幅を作れないもの）を拾う。**黙って点にしない** */
function pointOnlyFields(sel: WizardSelections): string[] {
  const out: string[] = [];
  if (sel.selfIncome === "prefer_not") out.push("ご本人の年収（答えたくない）");
  if (sel.spouseIncome === "prefer_not") out.push("配偶者の年収（答えたくない）");
  if (sel.assets === "unknown") out.push("金融資産（分からない）");
  if (sel.loan === "unknown") out.push("住宅ローン残高（分からない）");
  if (sel.educationPlan === "undecided" || sel.educationPlan === undefined) {
    out.push("お子さんの進路（まだ決めていない）");
  }
  return out;
}

/**
 * 緩め端・厳しめ端の入力を作る（＋単調でない組み合わせの追加候補）。
 *
 * 返す `point` は**いまの画面が使っている入力そのもの**なので、
 * 幅を使わない画面はこれまでどおり動く（既存の経路を壊さない）。
 */
export function normalizeEnds(p: ParamSet, sel: WizardSelections, asOf: Date): Ends {
  const point = normalize(p, sel, asOf);
  const loose = atEnd(p, sel, asOf, "loose");
  const strict = atEnd(p, sel, asOf, "strict");

  // 年収と生活費が連動する世帯だけ、年収を逆向きにした候補も混ぜる（包絡のため）
  const extra: DiagnoseInput[] =
    sel.livingCost === "estimate"
      ? [
          atEnd(p, sel, asOf, "loose", { flipIncome: true }).input,
          atEnd(p, sel, asOf, "strict", { flipIncome: true }).input,
        ]
      : [];

  return {
    point,
    loose: loose.input,
    strict: strict.input,
    extra,
    fields: loose.fields,
    pointOnly: pointOnlyFields(sel),
  };
}

/**
 * **どの回答の幅が、判定の跨ぎを起こしているか**を特定する（2026-09-23・T-H）。
 *
 * 画面の一文「この幅は、答えの幅（◯◯）から来ています」の ◯◯ にあたる。
 * **推測で名前を出さない。** その入力**だけ**を厳しめ端に動かして回し直し、
 * 判定が実際に変わったものだけを返す（複数あれば効き目の大きい順に並べる）。
 */
export function crossingDrivers(
  p: ParamSet,
  sel: WizardSelections,
  asOf: Date,
  who: "self" | "spouse" = "self",
): string[] {
  const point = normalize(p, sel, asOf).input;
  const strict = atEnd(p, sel, asOf, "strict").input;
  const verdictOf = (input: DiagnoseInput) => {
    const d = diagnose(p, input, asOf);
    const r = who === "self" ? d.self : d.spouse;
    return r ? { v: r.verdict, need: r.rawNeed } : null;
  };
  const base = verdictOf(point);
  if (!base) return [];

  /** 入力1つだけを厳しめ端に差し替えた入力を作る */
  const only: Array<{ label: string; input: DiagnoseInput }> = [
    {
      label: `ご本人の年収「${labelOf(INCOME_LABEL, sel.selfIncome) ?? ""}」`,
      input: { ...point, self: { ...point.self, income: strict.self.income } },
    },
    {
      label: `毎月の生活費「${labelOf(LIVING_LABEL, sel.livingCost) ?? ""}」`,
      input: { ...point, monthlyLiving: strict.monthlyLiving },
    },
    {
      label: `金融資産「${labelOf(ASSETS_LABEL, sel.assets) ?? ""}」`,
      input: { ...point, assets: strict.assets },
    },
    ...(point.spouse && strict.spouse
      ? [
          {
            label: `配偶者の年収「${labelOf(SPOUSE_INCOME_LABEL, sel.spouseIncome) ?? ""}」`,
            input: {
              ...point,
              spouse: { ...point.spouse, income: strict.spouse.income },
            },
          },
        ]
      : []),
    ...(sel.loan && sel.housing === "own_loan"
      ? [
          {
            label: `住宅ローン残高「${labelOf(LOAN_LABEL, sel.loan) ?? ""}」`,
            input: { ...point, housing: strict.housing },
          },
        ]
      : []),
  ];

  return only
    .map((x) => ({ label: x.label, r: verdictOf(x.input) }))
    .filter((x) => x.r !== null && x.r.v !== base.v)
    .sort((a, b) => (b.r?.need ?? 0) - (a.r?.need ?? 0))
    .map((x) => x.label);
}
