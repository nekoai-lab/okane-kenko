/**
 * 算定エンジンの型定義
 *
 * 設計原則（ADR-003）：金額はここでしか作らない。AIは翻訳者であり、数値を生成しない。
 * この層は外部サービスに一切依存しない純粋関数として保つ（NFR-13 / 可搬性）。
 */

export type Employment = "employee" | "self" | "none";
export type EducationPlan = "public" | "mixed" | "private";

/** 世帯の入力。すべてレンジ中央値に正規化された後の値（DR-02） */
export interface Household {
  /** 亡くなるケースを算定する側 */
  deceased: Person;
  /** 遺される側。独身なら null */
  survivor: Person | null;
  /** 子の現在年齢 */
  children: number[];
  housing: Housing;
  /** 世帯の金融資産（円） */
  assets: number;
  /** 月間生活費（円）。賃貸の家賃はここに含む */
  monthlyLiving: number;
  educationPlan: EducationPlan;
  /** 現在の保障額（円）。不明なら null → 過不足判定を pending にする（FR-14） */
  currentCoverage: number | null;
}

export interface Person {
  age: number;
  /** 年収（円） */
  income: number;
  employment: Employment;
}

export interface Housing {
  type: "own" | "rent";
  /** 住宅ローン残高（円） */
  loan?: number;
  /** 団体信用生命保険の有無。「分からない」は true 扱いにし、結果に併記する（§9-6） */
  danshin?: boolean;
}

export type Verdict =
  /** 不足している */
  | "shortage"
  /** 計算上は充足。安心の上乗せ目安を提示 */
  | "sufficient"
  /** 余剰が大きい。上乗せも不要と言い切る（煽らない） */
  | "ample"
  /** 扶養家族がいない。保障そのものが不要 */
  | "not_needed";

export type CoverageGapKind = "shortage" | "adequate" | "excess" | "pending";

export interface DeathResult {
  /** 支出見込 */
  expense: {
    livingChild: number;
    livingAlone: number;
    education: number;
    housing: number;
    funeral: number;
    total: number;
  };
  /** 収入・資産見込 */
  income: {
    pensionBasic: number;
    pensionKosei: number;
    chukoreiKafu: number;
    survivorWork: number;
    assets: number;
    total: number;
  };
  /** 期間 */
  years: { dependent: number; alone: number; total: number };
  /** 差引きの必要額（丸め前・円） */
  rawNeed: number;
  /** 余剰（収入 − 支出） */
  margin: number;
  /** 提示レンジ（円・100万円丸め） */
  range: { low: number; high: number };
  verdict: Verdict;
  /** 現在の保障との比較 */
  gap: { kind: CoverageGapKind; amount: number };
  /** 欠損を既定値で補った記録（DR-03 / 結果画面に表示する） */
  assumptions: Assumption[];
}

export interface Assumption {
  field: string;
  value: string | number;
  reason: "estimated" | "default" | "unknown";
  note: string;
}

export type MedicalVerdict = "self_insurable" | "partial" | "needed";

export interface MedicalResult {
  category: string;
  /** 月額自己負担上限（円） */
  monthlyCap: number;
  /** 標準入院時の想定自己負担（円） */
  burdenStandard: number;
  /** 長期化時の想定自己負担（円） */
  burdenLong: number;
  assets: number;
  verdict: MedicalVerdict;
}

/** 世帯単位の診断結果（ADR-007） */
export interface HouseholdDiagnosis {
  paramVersion: string;
  /** 本人が亡くなるケース */
  self: DeathResult;
  /** 配偶者が亡くなるケース。独身・配偶者未入力なら null */
  spouse: DeathResult | null;
  medical: MedicalResult;
  /** 2028年改正の該当判定（FR-17） */
  reform2028: { applicable: boolean; reason: string };
  /** 世帯としての結論（FR-25）。self / spouse を1行に畳んだもの */
  householdHeadline: HouseholdHeadline;
}

export interface HouseholdHeadline {
  kind: /** どちらも足りている */
    | "all_covered"
    /** 世帯として不足がある */
    | "shortage"
    /** 減らせる箇所がある */
    | "reducible"
    /** 片方が過剰・片方が不足＝合計保険料を増やさずに解決できる（ADR-007c） */
    | "rebalanceable";
  /** 世帯合計の減額余地（円） */
  totalExcess: number;
  /** 世帯合計の不足（円） */
  totalShortage: number;
}
