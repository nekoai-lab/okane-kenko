/**
 * ウィザード状態 ⇄ URL（FR-08 / US-03）
 *
 * DB を使わずに中断・再開を成り立たせる（Phase A）。URL には「区分コードだけ」を載せ、
 * 実額は載せない（NFR-10 / DR-02）。URL は本人が書き換えられる前提なので、decode 側は
 * 未知の値を落として「未回答」として扱う（壊さない）。途中状態を許すため Partial を扱う。
 */
import type {
  AssetCode,
  DanshinChoice,
  EmploymentChoice,
  HousingChoice,
  IncomeCode,
  LivingCode,
  LoanCode,
  SpouseEmploymentChoice,
  SpouseIncomeCode,
  WizardSelections,
} from "./types.js";

/** URL スキーマ版。設問やコードを変えたら上げ、古い URL を安全に無視する */
export const WIZARD_URL_VERSION = "1";

const EMPLOYMENT: readonly EmploymentChoice[] = ["employee", "civil_servant", "self"];
const SPOUSE_EMPLOYMENT: readonly SpouseEmploymentChoice[] = [...EMPLOYMENT, "none"];
const INCOME: readonly IncomeCode[] = [
  "lt400",
  "lt600",
  "lt800",
  "lt1000",
  "gte1000",
  "prefer_not",
];
const SPOUSE_INCOME: readonly SpouseIncomeCode[] = [...INCOME, "none"];
const ASSET: readonly AssetCode[] = ["lt100", "lt300", "lt500", "lt1000", "gte1000", "unknown"];
const LIVING: readonly LivingCode[] = ["lt20", "lt25", "lt30", "lt35", "gte35", "estimate"];
const HOUSING: readonly HousingChoice[] = ["own_loan", "own_noloan", "rent"];
const LOAN: readonly LoanCode[] = [
  "lt500",
  "lt1000",
  "lt1500",
  "lt2000",
  "lt3000",
  "gte3000",
  "unknown",
];
const DANSHIN: readonly DanshinChoice[] = ["yes", "no", "unknown"];

function pick<T extends string>(allowed: readonly T[], raw: string | null): T | undefined {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** 生年など「妥当な西暦4桁」だけ受ける。範囲外・非数値は落とす */
function year(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : undefined;
}

export function encodeSelections(sel: Partial<WizardSelections>): string {
  const q = new URLSearchParams();
  q.set("v", WIZARD_URL_VERSION);
  if (sel.selfBirthYear !== undefined) q.set("sb", String(sel.selfBirthYear));
  if (sel.selfEmployment) q.set("emp", sel.selfEmployment);
  if (sel.hasSpouse !== undefined) q.set("sp", sel.hasSpouse ? "1" : "0");
  if (sel.spouseBirthYear !== undefined) q.set("spb", String(sel.spouseBirthYear));
  if (sel.spouseEmployment) q.set("spe", sel.spouseEmployment);
  if (sel.childrenBirthYears && sel.childrenBirthYears.length > 0) {
    q.set("ch", sel.childrenBirthYears.join("-"));
  }
  if (sel.selfIncome) q.set("inc", sel.selfIncome);
  if (sel.spouseIncome) q.set("sinc", sel.spouseIncome);
  if (sel.assets) q.set("as", sel.assets);
  if (sel.livingCost) q.set("liv", sel.livingCost);
  if (sel.housing) q.set("ho", sel.housing);
  if (sel.loan) q.set("loan", sel.loan);
  if (sel.danshin) q.set("dan", sel.danshin);
  return q.toString();
}

export function decodeSelections(query: string | URLSearchParams): Partial<WizardSelections> {
  const q = typeof query === "string" ? new URLSearchParams(query) : query;
  // 版が違う URL は解釈しない（古い設問構成で誤復元しない）
  if (q.get("v") !== WIZARD_URL_VERSION) return {};

  const sel: Partial<WizardSelections> = {};
  const sb = year(q.get("sb"));
  if (sb !== undefined) sel.selfBirthYear = sb;
  const emp = pick(EMPLOYMENT, q.get("emp"));
  if (emp) sel.selfEmployment = emp;
  const sp = q.get("sp");
  if (sp === "1" || sp === "0") sel.hasSpouse = sp === "1";
  const spb = year(q.get("spb"));
  if (spb !== undefined) sel.spouseBirthYear = spb;
  const spe = pick(SPOUSE_EMPLOYMENT, q.get("spe"));
  if (spe) sel.spouseEmployment = spe;
  const ch = q.get("ch");
  if (ch !== null && ch !== "") {
    const years = ch.split("-").map((s) => year(s));
    if (years.every((y): y is number => y !== undefined)) sel.childrenBirthYears = years;
  }
  const inc = pick(INCOME, q.get("inc"));
  if (inc) sel.selfIncome = inc;
  const sinc = pick(SPOUSE_INCOME, q.get("sinc"));
  if (sinc) sel.spouseIncome = sinc;
  const as = pick(ASSET, q.get("as"));
  if (as) sel.assets = as;
  const liv = pick(LIVING, q.get("liv"));
  if (liv) sel.livingCost = liv;
  const ho = pick(HOUSING, q.get("ho"));
  if (ho) sel.housing = ho;
  const loan = pick(LOAN, q.get("loan"));
  if (loan) sel.loan = loan;
  const dan = pick(DANSHIN, q.get("dan"));
  if (dan) sel.danshin = dan;
  return sel;
}
