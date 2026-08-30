/**
 * 年次キャッシュフロー（SPEC US-04b / US-04c）
 *
 * **なぜ要るか**：総額の引き算（支出計 − 収入計）は、いちばん細い時期を平らに均してしまう。
 * 実測した世帯では、総額では「足りている」なのに、遺族基礎年金が切れる4年間の
 * 年間収支が +7万円まで落ちていた（2026-08-30）。金額が正しいかどうかより先に、
 * 「いつ苦しいか」に答えられていないことがこの診断の弱点だった。
 *
 * 行の構成は**日本FP協会のキャッシュフロー表**に合わせている（収入合計／支出合計／
 * 年間収支／貯蓄残高）。独自形式にしないのは、FPに相談したとき同じ表で話が通じるため。
 *
 * **ここは新しい数式を持たない。** 既存の `calcDeath` が年ごとに計算してから
 * 合計に潰していたものを、潰さずに返すだけ。だから
 * 「年次の合計 ＝ 既存の総額」が不変条件になり、ゴールデンの期待値を動かさずに載せられる。
 *
 * 変動率は受け取れるが**既定は全て0**。実値への切り替えはパラメータ版の更新でやる
 * （式を触らない）。支出だけに掛けると不足が構造的に膨らむので、収入側にも率を持たせている。
 */
import type { EducationParams, ParamSet } from "../params/index.js";
import { v } from "../params/index.js";
import { annualEducation } from "./death.js";
import { chukoreiKafuAnnual, izokuKisoAnnual, izokuKoseiAnnual, koseiYears } from "./pension.js";
import type { EducationPlan, Household } from "./types.js";

/**
 * 行ごとの変動率（年率）。**支出だけに掛けない。**
 * 実績値の例：生活費＝消費者物価、年金＝改定率（マクロ経済スライド調整後）、
 * 就労＝名目手取り賃金変動率。住宅ローン返済と金融資産は名目で固定（率を持たない）。
 */
export interface Rates {
  living: number;
  education: number;
  pensionBasic: number;
  pensionKosei: number;
  work: number;
}

export const NO_INFLATION: Rates = {
  living: 0,
  education: 0,
  pensionBasic: 0,
  pensionKosei: 0,
  work: 0,
};

export interface ProjectionRow {
  /** 西暦 */
  year: number;
  /** 経過年数（0始まり） */
  elapsed: number;
  ages: { survivor: number | null; children: number[] };
  /** その年に起きること（金額の変化から導く。ルールを二重に持たない） */
  events: string[];
  income: {
    work: number;
    pensionBasic: number;
    pensionKosei: number;
    chukoreiKafu: number;
    total: number;
  };
  expense: { living: number; education: number; housing: number; funeral: number; total: number };
  /** 年間収支（収入合計 − 支出合計） */
  net: number;
  /** 貯蓄残高（前年の残高 ＋ 年間収支）。初年度は金融資産から始まる */
  balance: number;
}

export interface Projection {
  rows: ProjectionRow[];
  /** 年間収支がいちばん小さい年（＝いちばん細い年）。行が無ければ null */
  tightest: ProjectionRow | null;
  /** 貯蓄残高が初めてマイナスになる年。無ければ null */
  depletedAt: ProjectionRow | null;
}

/** 教育費が残っている最終年（子の年齢ベース）。算定期間より長いことがある */
function educationYearsLeft(edu: EducationParams, children: number[]): number {
  if (children.length === 0) return 0;
  return Math.max(0, edu.university.toAge - Math.min(...children) + 1);
}

/**
 * 死亡シナリオの年次キャッシュフロー。
 * `calcDeath` と同じ前提・同じ係数で、合計する前の姿を返す。
 */
export function projectDeath(
  p: ParamSet,
  h: Household,
  opts: { asOfYear: number; plan?: EducationPlan; rates?: Rates },
): Projection {
  const rates = opts.rates ?? NO_INFLATION;
  const plan = opts.plan ?? h.educationPlan;
  const { deceased, survivor, children, housing } = h;

  const indepAge = v(p, "childIndepAge");
  const pensionAge = v(p, "pensionAge");
  const yTotal = survivor ? Math.max(0, pensionAge - survivor.age) : 0;
  const yDepRaw = children.length > 0 ? Math.max(0, indepAge - Math.min(...children)) : 0;
  const yDep = Math.min(yDepRaw, yTotal);
  const yAlone = Math.max(0, yTotal - yDep);

  // 教育費は算定期間より長く続くことがある（配偶者が先に65歳になる世帯）。
  // 総額と一致させるため、表の長さは「算定期間」と「教育費の残り」の長いほうに合わせる。
  // 最低1年は必ず出す ─ 独身世帯は算定期間が0だが、葬儀・予備費は初年度に発生する。
  const horizon = Math.max(1, yTotal, educationYearsLeft(p.education, children));

  const koseiAnnual = izokuKoseiAnnual(p, deceased);
  const koseiLimit = koseiYears(p, children.length > 0, yTotal);
  const netNow = survivor ? survivor.income * v(p, "netIncomeRatio") : 0;
  const netAfter = Math.max(netNow, v(p, "postIndepMinIncome"));

  // 団信なしの住宅ローンは、総額では残高を一括で計上している。年次では返済として
  // 均等に割る（FP協会も「69歳まで一定」として扱う）。一括のままだと谷が見えない。
  const housingTotal =
    housing.type === "own" && (housing.loan ?? 0) > 0 && housing.danshin === false
      ? (housing.loan ?? 0)
      : 0;
  const housingYears = Math.max(1, yTotal);

  const grow = (base: number, rate: number, t: number) => base * (1 + rate) ** t;

  const rows: ProjectionRow[] = [];
  // 残高の出発点は「金融資産 ＋ いまの保険で受け取れる額」。保険金を無視すると、
  // 底をつく年が実態より早く出て、いらない不安を与える（＝煽りになる）。
  // 保険が分からない世帯（null）は資産だけで始め、その旨は画面側が明示する。
  let balance = h.assets + (h.currentCoverage ?? 0);
  let prev: ProjectionRow | null = null;

  for (let t = 0; t < horizon; t++) {
    const agesNow = children.map((a) => a + t);
    const inDep = t < yDep;
    const inTerm = t < yTotal;

    const livingBase = inTerm
      ? h.monthlyLiving * v(p, inDep ? "survivorLivingRatioChild" : "survivorLivingRatioAlone") * 12
      : 0;
    const educationBase = agesNow.reduce(
      (s, age) => s + annualEducation(p.education, plan, age),
      0,
    );

    const expense = {
      living: grow(livingBase, rates.living, t),
      education: grow(educationBase * p.education.regionFactor, rates.education, t),
      housing: t < housingYears ? housingTotal / housingYears : 0,
      funeral: t === 0 ? v(p, "funeralReserve") : 0,
      total: 0,
    };
    expense.total = expense.living + expense.education + expense.housing + expense.funeral;

    const income = {
      work: survivor && inTerm ? grow(inDep ? netNow : netAfter, rates.work, t) : 0,
      pensionBasic:
        survivor && inTerm ? grow(izokuKisoAnnual(p, agesNow), rates.pensionBasic, t) : 0,
      pensionKosei: survivor && t < koseiLimit ? grow(koseiAnnual, rates.pensionKosei, t) : 0,
      chukoreiKafu:
        survivor && inTerm
          ? grow(
              chukoreiKafuAnnual(p, {
                survivorAgeAtDeath: survivor.age,
                survivorAgeNow: survivor.age + t,
                childrenAgesNow: agesNow,
                hasChildAtDeath: children.length > 0,
              }),
              rates.pensionKosei,
              t,
            )
          : 0,
      total: 0,
    };
    income.total = income.work + income.pensionBasic + income.pensionKosei + income.chukoreiKafu;

    const net = income.total - expense.total;
    balance += net;

    const row: ProjectionRow = {
      year: opts.asOfYear + t,
      elapsed: t,
      ages: { survivor: survivor ? survivor.age + t : null, children: agesNow },
      events: [],
      income,
      expense,
      net,
      balance,
    };

    // イベントは金額の変化から導く。判定ルールをここに書き足すと、算定と二重管理になる。
    if (t === 0) row.events.push("診断の起点");
    if (prev) {
      if (prev.income.pensionBasic > 0 && income.pensionBasic === 0) {
        row.events.push("遺族基礎年金が終わる");
      }
      if (prev.income.chukoreiKafu === 0 && income.chukoreiKafu > 0) {
        row.events.push("中高齢寡婦加算が始まる");
      }
      if (prev.expense.education > 0 && expense.education === 0) row.events.push("教育費が終わる");
      if (prev.income.pensionKosei > 0 && income.pensionKosei === 0) {
        row.events.push("遺族厚生年金が終わる");
      }
    }
    if (t === yDep && yDep > 0 && yAlone > 0) row.events.push("末子が独立（生活費が下がる）");
    if (t === yTotal - 1 && yTotal > 0) row.events.push("配偶者が65歳");

    rows.push(row);
    prev = row;
  }

  const tightest = rows.reduce<ProjectionRow | null>(
    (min, r) => (min === null || r.net < min.net ? r : min),
    null,
  );
  const depletedAt = rows.find((r) => r.balance < 0) ?? null;

  return { rows, tightest, depletedAt };
}
