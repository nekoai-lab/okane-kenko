/**
 * 候補値の影響を測る（フェーズ2b）。**AIは使わない。既存の算定エンジンを回すだけ。**
 *
 * 差分が出たら「いくら変わったか」ではなく「**結論が変わる世帯が何件あるか**」で重要度を決める。
 * 差分があっても結論が変わらなければ静かにする（通知は「きっかけ」であって結論ではない）。
 */
import type { GoldenCase } from "../__tests__/households.js";
import type { DiagnoseInput } from "../calc/index.js";
import { diagnose } from "../calc/index.js";
import { simulate } from "../calc/simulate.js";
import type { Verdict3 } from "../calc/verdict3.js";
import type { ParamSet } from "../params/index.js";
import { resolveTarget, setAt } from "./paths.js";

export interface ParamChange {
  /** `watch-sources.yaml` の key（ドット無し＝public のキー／ドット区切り＝params 上の位置） */
  key: string;
  label: string;
  current: number;
  proposed: number;
  /** 画面に出す単位。無ければ「円」（2026-09-22 追加。給付制限を「2円」と出さないため） */
  unit?: string;
}

export interface HouseholdImpact {
  id: string;
  label: string;
  headlineBefore: string;
  headlineAfter: string;
  changed: boolean;
  /** 本人ケースの必要額（円・丸め前） */
  needBefore: number;
  needAfter: number;
  /**
   * 死亡＋statutory 3行の行ごとの前後（2026-09-22・D2）。**2つの軸を別々に持つ**
   * （CLAUDE.md「判定には必ず軸名を添える」）。それ以前の提案には無い
   */
  rows?: RowImpact[];
}

/** 画面の診断表と同じ4行。障害は計算未対応なので比べない */
export const IMPACT_ROWS = ["death", "sick_short", "sick_long", "unemployment"] as const;
export type ImpactRow = (typeof IMPACT_ROWS)[number];

export interface RowImpact {
  scenario: ImpactRow;
  /** 必要額（ニーズ軸）。円 */
  needBefore: { low: number; high: number };
  needAfter: { low: number; high: number };
  /** 過不足の判定（過不足軸・Verdict3）。カードのバッジと同じ値 */
  verdictBefore: Verdict3 | null;
  verdictAfter: Verdict3 | null;
  /** 必要額の判定（ニーズ軸）。死亡の行だけが持つ（`DeathResult.verdict`） */
  needVerdictBefore?: string;
  needVerdictAfter?: string;
}

export interface InvariantFailure {
  id: string;
  what: string;
}

export interface Impact {
  changedCount: number;
  households: HouseholdImpact[];
  invariantFailures: InvariantFailure[];
  /**
   * **現行 params でゴールデンが green でない**ときの食い違い（2026-09-22・D2）。
   * 比べる土台が壊れていたら、前後の差は何も意味しない。それ以前の提案には無い
   */
  baselineFailures?: InvariantFailure[];
  /**
   * 不合格の条件は2つだけ：不変条件の違反と、現行 params で green でないこと。
   * **結論が変わることは不合格ではない**（それは承認者への影響レポートの中身）。
   * **false なら承認ボタンを出さない。**
   */
  safe: boolean;
}

export interface WatchCase {
  id: string;
  label: string;
  input: DiagnoseInput;
  /** ゴールデンの期待値。**現行 params で green かを確かめるためだけに使う**（候補値とは比べない） */
  expect?: GoldenCase["expect"];
}

/** 候補値を載せた ParamSet を作る。**元の ParamSet は変えない**（`params/` にも触れない）。 */
export function applyChanges(p: ParamSet, changes: ParamChange[]): ParamSet {
  const next = structuredClone(p);
  for (const c of changes) {
    // `public` の外（制度式パラメータ）も同じ口で書く（2026-09-22・T-G）
    const target = resolveTarget(next, c.key);
    if (target === undefined) throw new Error(`監視対象が params に無い: ${c.key}`);
    setAt(next, target.path, c.proposed);
  }
  return next;
}

/**
 * 不変条件。**期待値との一致ではなく、パラメータの値によらず成り立つことだけを見る。**
 *
 * ゴールデンテストの期待値は「いまのパラメータ版での検算」なので、
 * 年金額が動けば期待値は当然ずれる。**それを不合格と呼ぶと、正しい更新が永久に通らない。**
 * ここで見るのは、内訳の合計が合うか・レンジが壊れていないか・同じ入力で同じ結果になるか。
 */
function checkInvariants(p: ParamSet, cases: WatchCase[]): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  for (const c of cases) {
    const r = diagnose(p, c.input);
    const e = r.self.expense;
    const i = r.self.income;
    const expenseParts = e.livingChild + e.livingAlone + e.education + e.housing + e.funeral;
    const incomeParts =
      i.pensionBasic + i.pensionKosei + i.chukoreiKafu + i.survivorWork + i.assets;

    if (expenseParts !== e.total)
      failures.push({ id: c.id, what: "支出の内訳合計が総額と合わない" });
    if (incomeParts !== i.total)
      failures.push({ id: c.id, what: "収入の内訳合計が総額と合わない" });
    if (r.self.range.low < 0 || r.self.range.high < 0) {
      failures.push({ id: c.id, what: "提示レンジが負になっている" });
    }
    if (r.self.range.low > r.self.range.high) {
      failures.push({ id: c.id, what: "提示レンジの下限が上限を超えている" });
    }
    // 再現性（AR-06）。同じ入力で結論が揺れたら、以降の比較そのものが無意味になる
    if (JSON.stringify(diagnose(p, c.input)) !== JSON.stringify(r)) {
      failures.push({ id: c.id, what: "同じ入力で結果が一致しない" });
    }
  }
  return failures;
}

const man = (yen: number) => Math.round(yen / 10_000);

/**
 * 現行 params でゴールデンが green か（`src/__tests__/golden.test.ts` と同じ項目を見る）。
 * **期待値は候補値とは比べない。** 期待値は版で変わるので、候補値で照合すると正しい更新が永久に通らない。
 */
export function baselineFailures(p: ParamSet, cases: WatchCase[], asOf: Date): InvariantFailure[] {
  const out: InvariantFailure[] = [];
  for (const c of cases) {
    const e = c.expect;
    if (!e) continue;
    const r = diagnose(p, c.input, asOf);
    const got = [
      ["self.verdict", r.self.verdict, e.self.verdict],
      ["self.low", man(r.self.range.low), e.self.low],
      ["self.high", man(r.self.range.high), e.self.high],
      ["self.gap", r.self.gap.kind, e.self.gap],
      ["self.gapAmount", man(r.self.gap.amount), e.self.gapAmount],
      ["medical", r.medical.verdict, e.medical],
      ["reform2028", r.reform2028.applicable, e.reform2028],
      ["headline", r.householdHeadline.kind, e.headline],
    ] as Array<[string, unknown, unknown]>;
    if (e.spouse && r.spouse) {
      got.push(
        ["spouse.verdict", r.spouse.verdict, e.spouse.verdict],
        ["spouse.low", man(r.spouse.range.low), e.spouse.low],
        ["spouse.high", man(r.spouse.range.high), e.spouse.high],
        ["spouse.gap", r.spouse.gap.kind, e.spouse.gap],
        ["spouse.gapAmount", man(r.spouse.gap.amount), e.spouse.gapAmount],
      );
    } else if (e.spouse) {
      got.push(["spouse", "なし", "あり"]);
    }
    for (const [what, actual, expected] of got) {
      if (actual !== expected) {
        out.push({ id: c.id, what: `${what}：期待 ${String(expected)}／現行 ${String(actual)}` });
      }
    }
  }
  return out;
}

function rowsFor(p: ParamSet, input: DiagnoseInput, asOf: Date) {
  return IMPACT_ROWS.map((sc) => simulate(p, { answers: input, asOf }, sc));
}

export function assessImpact(
  p: ParamSet,
  changes: ParamChange[],
  cases: WatchCase[],
  asOf: Date = new Date(),
): Impact {
  const candidate = applyChanges(p, changes);
  const households = cases.map((c) => {
    const before = diagnose(p, c.input, asOf);
    const after = diagnose(candidate, c.input, asOf);
    const rb = rowsFor(p, c.input, asOf);
    const ra = rowsFor(candidate, c.input, asOf);
    const rows: RowImpact[] = IMPACT_ROWS.map((sc, i) => ({
      scenario: sc,
      needBefore: { low: rb[i].amounts?.needLow ?? 0, high: rb[i].amounts?.needHigh ?? 0 },
      needAfter: { low: ra[i].amounts?.needLow ?? 0, high: ra[i].amounts?.needHigh ?? 0 },
      verdictBefore: rb[i].verdict,
      verdictAfter: ra[i].verdict,
      ...(sc === "death"
        ? { needVerdictBefore: before.self.verdict, needVerdictAfter: after.self.verdict }
        : {}),
    }));
    return {
      id: c.id,
      label: c.label,
      headlineBefore: before.householdHeadline.kind,
      headlineAfter: after.householdHeadline.kind,
      changed: before.householdHeadline.kind !== after.householdHeadline.kind,
      needBefore: before.self.rawNeed,
      needAfter: after.self.rawNeed,
      rows,
    };
  });
  const invariantFailures = checkInvariants(candidate, cases);
  const baseline = baselineFailures(p, cases, asOf);
  return {
    changedCount: households.filter((h) => h.changed).length,
    households,
    invariantFailures,
    baselineFailures: baseline,
    safe: invariantFailures.length === 0 && baseline.length === 0,
  };
}

const ROW_LABEL: Record<ImpactRow, string> = {
  death: "死亡",
  sick_short: "病気・けが（短期）",
  sick_long: "病気・けが（長期休職）",
  unemployment: "失業",
};

const signedMan = (yen: number) => {
  const v = Math.round(yen / 1_000) / 10; // 0.1万円単位
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}万`;
};

function spread(deltas: number[]): string {
  const moved = deltas.filter((d) => d !== 0);
  if (moved.length === 0) return "変化なし";
  const lo = Math.min(...moved);
  const hi = Math.max(...moved);
  return lo === hi ? signedMan(lo) : `${signedMan(lo)}〜${signedMan(hi)}`;
}

/**
 * 行ごとの影響を1行にする（行動ログと承認画面用）。**軸名を必ず添える。**
 * 「結論が変わる世帯」は名指しする（件数だけにしない）。
 */
export function summarizeRows(impact: Impact): string[] {
  const hs = impact.households.filter((h) => h.rows);
  if (hs.length === 0) return [];
  return IMPACT_ROWS.map((sc) => {
    const rs = hs.map((h) => ({ id: h.id, r: (h.rows ?? []).find((x) => x.scenario === sc) }));
    const moved = rs.filter(
      ({ r }) =>
        r && (r.needBefore.low !== r.needAfter.low || r.needBefore.high !== r.needAfter.high),
    );
    const lowD = rs.map(({ r }) => (r ? r.needAfter.low - r.needBefore.low : 0));
    const highD = rs.map(({ r }) => (r ? r.needAfter.high - r.needBefore.high : 0));
    const v3 = rs.filter(({ r }) => r && r.verdictBefore !== r.verdictAfter);
    const nv = rs.filter(({ r }) => r?.needVerdictBefore !== r?.needVerdictAfter);
    const named = (xs: typeof rs, f: (r: RowImpact) => string) =>
      xs.length === 0 ? "" : `（${xs.map(({ id, r }) => `${id} ${r ? f(r) : ""}`).join("、")}）`;
    const parts = [
      `必要額（ニーズ軸）が動く世帯 ${moved.length}/${hs.length}：needHigh ${spread(highD)}・needLow ${spread(lowD)}`,
      `過不足の判定（過不足軸）が変わる世帯 ${v3.length}/${hs.length}${named(v3, (r) => `${r.verdictBefore}→${r.verdictAfter}`)}`,
    ];
    if (sc === "death") {
      parts.push(
        `必要額の判定（ニーズ軸）が変わる世帯 ${nv.length}/${hs.length}${named(nv, (r) => `${r.needVerdictBefore}→${r.needVerdictAfter}`)}`,
      );
    }
    return `${ROW_LABEL[sc]}：${parts.join("／")}`;
  });
}
