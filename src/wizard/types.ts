/**
 * 入力ウィザードの生の選択（S1〜S5・保険以外）。
 *
 * ここはユーザーが選んだ「区分コード」だけを持つ。実額は持たない（DR-02 / NFR-10）。
 * 算定エンジンの点の値への写像は normalize.ts が担う。性別は集めない（算定が使わないため）。
 */
import type { DiagnoseInput } from "../calc/index.js";

export type EmploymentChoice = "employee" | "civil_servant" | "self";
export type SpouseEmploymentChoice = EmploymentChoice | "none"; // none = 専業・無職
export type IncomeCode = "lt400" | "lt600" | "lt800" | "lt1000" | "gte1000" | "prefer_not";
export type SpouseIncomeCode = IncomeCode | "none"; // none = 収入なし
export type AssetCode = "lt100" | "lt300" | "lt500" | "lt1000" | "gte1000" | "unknown";
export type LivingCode = "lt20" | "lt25" | "lt30" | "lt35" | "gte35" | "estimate";
/** S2 子の進路。undecided は公立中心で仮置きし推定フラグを立てる（子がいる世帯のみ） */
export type EducationPlanChoice = "public" | "mixed" | "private" | "undecided";
export type HousingChoice = "own_loan" | "own_noloan" | "rent";
export type LoanCode = "lt500" | "lt1000" | "lt1500" | "lt2000" | "lt3000" | "gte3000" | "unknown";
export type DanshinChoice = "yes" | "no" | "unknown";
/** S6 現在の死亡保障額（被保険者ごと）。unknown は過不足を保留（pending）にする */
export type CoverageCode =
  | "none"
  | "m300"
  | "m500"
  | "m1000"
  | "m1500"
  | "m2000"
  | "m3000"
  | "m5000"
  | "gte10000"
  | "unknown";

export interface WizardSelections {
  /** S1 本人の生年（性別は集めない） */
  selfBirthYear: number;
  selfEmployment: EmploymentChoice;
  /** S2 配偶者 */
  hasSpouse: boolean;
  spouseBirthYear?: number;
  spouseEmployment?: SpouseEmploymentChoice;
  /** S2 子（各子の生年。いなければ空配列） */
  childrenBirthYears: number[];
  /** S2 子の進路（子がいる世帯のみ必須）。undecided=まだ決めていない */
  educationPlan?: EducationPlanChoice;
  /** S3 年収 */
  selfIncome: IncomeCode;
  spouseIncome?: SpouseIncomeCode;
  /** S4 資産・生活費 */
  assets: AssetCode;
  /** 生活費は住居費（家賃）込み・住宅ローン返済は除く。estimate は年収から推定 */
  livingCost: LivingCode;
  /** S5 住まい */
  housing: HousingChoice;
  loan?: LoanCode;
  danshin?: DanshinChoice;
  /** S6 現在の保険：本人が被保険者の死亡保障額（合計）。unknown=分からない→過不足 pending */
  coverageSelf?: CoverageCode;
  /** S6 現在の保険：配偶者が被保険者の死亡保障額（合計）。配偶者ありなら必須 */
  coverageSpouse?: CoverageCode;
}

/** 「答えたくない／分からない／推定」で補った項目の記録（DR-03） */
export interface Estimation {
  field: string;
  reason: "prefer_not" | "unknown" | "estimated_from_income" | "undecided";
  note: string;
}

export interface NormalizedInput {
  input: DiagnoseInput;
  estimations: Estimation[];
}
