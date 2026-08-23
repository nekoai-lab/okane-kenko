/**
 * 入力の正規化（DR-02）：ウィザードの区分コードを算定エンジンの DiagnoseInput に写像する。
 *
 * 代表値は params.inputRanges にある（コード直書きしない・CLAUDE.md）。純粋関数として保つ。
 * 年齢は「基準年 − 生年」。基準日は外から渡す（Date.now() を関数内で呼ばない）。
 * 保険（coverage）は S6=T-04 の担当。ここでは coverageSelf=null（過不足は保留）にしておく。
 */
import type { DiagnoseInput, Employment, Person } from "../calc/index.js";
import type { ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import type {
  EmploymentChoice,
  Estimation,
  NormalizedInput,
  SpouseEmploymentChoice,
  SpouseIncomeCode,
  WizardSelections,
} from "./types.js";

function lookup(table: Record<string, number>, key: string, kind: string): number {
  const val = table[key];
  if (val === undefined) throw new Error(`未知の${kind}区分: ${key}`);
  return val;
}

function toEmployment(c: EmploymentChoice | SpouseEmploymentChoice): Employment {
  if (c === "self") return "self";
  if (c === "none") return "none";
  return "employee"; // 会社員・公務員はどちらも厚生年金の被保険者
}

export function normalize(p: ParamSet, sel: WizardSelections, asOf: Date): NormalizedInput {
  const asOfYear = asOf.getFullYear();
  const age = (birthYear: number) => asOfYear - birthYear;
  const estimations: Estimation[] = [];

  // ---------- 本人 ----------
  const selfIncome = lookup(p.inputRanges.income, sel.selfIncome, "年収");
  if (sel.selfIncome === "prefer_not") {
    estimations.push({
      field: "selfIncome",
      reason: "prefer_not",
      note: "本人の年収は「答えたくない」を選ばれたため、区分エ相当で仮置きしました。",
    });
  }
  const self: Person = {
    age: age(sel.selfBirthYear),
    income: selfIncome,
    employment: toEmployment(sel.selfEmployment),
  };

  // ---------- 配偶者 ----------
  let spouse: Person | null = null;
  if (sel.hasSpouse && sel.spouseBirthYear !== undefined) {
    const code: SpouseIncomeCode = sel.spouseIncome ?? "none";
    const spouseIncome = code === "none" ? 0 : lookup(p.inputRanges.income, code, "年収");
    if (code === "prefer_not") {
      estimations.push({
        field: "spouseIncome",
        reason: "prefer_not",
        note: "配偶者の年収は「答えたくない」を選ばれたため、区分エ相当で仮置きしました。",
      });
    }
    spouse = {
      age: age(sel.spouseBirthYear),
      income: spouseIncome,
      employment: toEmployment(sel.spouseEmployment ?? "none"),
    };
  }

  // ---------- 子 ----------
  const children = sel.childrenBirthYears.map(age);

  // ---------- 資産 ----------
  const assets = lookup(p.inputRanges.assets, sel.assets, "資産");
  if (sel.assets === "unknown") {
    estimations.push({
      field: "assets",
      reason: "unknown",
      note: "金融資産は「分からない」を選ばれたため、300万円で仮置きしました。",
    });
  }

  // ---------- 生活費（住居費込み・ローン返済は除く） ----------
  let monthlyLiving: number;
  if (sel.livingCost === "estimate") {
    // M = 世帯手取り年収 × 生活費率 / 12（§4.2.1）。0.75 は当社基準（OI-06・要確認）。
    const householdIncome = self.income + (spouse?.income ?? 0);
    const net = householdIncome * v(p, "netIncomeRatio");
    monthlyLiving = Math.round((net * v(p, "livingCostFromIncome")) / 12);
    estimations.push({
      field: "monthlyLiving",
      reason: "estimated_from_income",
      note: "毎月の生活費は年収から推定しました（世帯手取りの75%・当社基準）。",
    });
  } else {
    monthlyLiving = lookup(p.inputRanges.monthlyLiving, sel.livingCost, "生活費");
  }

  // ---------- 住まい ----------
  let housing: DiagnoseInput["housing"];
  if (sel.housing === "rent") {
    // 賃貸の家賃は生活費（monthlyLiving）に含む前提。ここでは住居費を別に足さない。
    housing = { type: "rent" };
  } else if (sel.housing === "own_noloan") {
    housing = { type: "own", loan: 0 };
  } else {
    const loanCode = sel.loan ?? "unknown";
    const loan = lookup(p.inputRanges.loan, loanCode, "ローン残高");
    if (loanCode === "unknown") {
      estimations.push({
        field: "loan",
        reason: "unknown",
        note: "住宅ローン残高は「分からない」を選ばれたため、仮置きしました。",
      });
    }
    // 団信「分からない」は undefined のまま渡す。算定側が「あり」として扱い、その旨を結果に残す。
    const danshin = sel.danshin === "yes" ? true : sel.danshin === "no" ? false : undefined;
    housing = { type: "own", loan, danshin };
  }

  const input: DiagnoseInput = {
    self,
    spouse,
    children,
    housing,
    assets,
    monthlyLiving,
    educationPlan: "public", // S2 の教育プランは MVP では public 固定（設問化は別チケット）
    coverageSelf: null, // 保険は S6=T-04。ここでは過不足を保留にする
  };

  return { input, estimations };
}
