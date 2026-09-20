/**
 * 候補値の影響を測る（フェーズ2b）。**AIは使わない。既存の算定エンジンを回すだけ。**
 *
 * 差分が出たら「いくら変わったか」ではなく「**結論が変わる世帯が何件あるか**」で重要度を決める。
 * 差分があっても結論が変わらなければ静かにする（通知は「きっかけ」であって結論ではない）。
 */
import type { DiagnoseInput } from "../calc/index.js";
import { diagnose } from "../calc/index.js";
import type { ParamSet } from "../params/index.js";

export interface ParamChange {
  /** `params/*.yaml` の public セクションのキー */
  key: string;
  label: string;
  current: number;
  proposed: number;
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
}

export interface InvariantFailure {
  id: string;
  what: string;
}

export interface Impact {
  changedCount: number;
  households: HouseholdImpact[];
  invariantFailures: InvariantFailure[];
  /** 不変条件をすべて満たしたか。**false なら承認ボタンを出さない。** */
  safe: boolean;
}

export interface WatchCase {
  id: string;
  label: string;
  input: DiagnoseInput;
}

/** 候補値を載せた ParamSet を作る。**元の ParamSet は変えない**（`params/` にも触れない）。 */
export function applyChanges(p: ParamSet, changes: ParamChange[]): ParamSet {
  const next = structuredClone(p);
  for (const c of changes) {
    const entry = next.public[c.key];
    if (entry === undefined) throw new Error(`監視対象が params に無い: ${c.key}`);
    entry.value = c.proposed;
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

export function assessImpact(p: ParamSet, changes: ParamChange[], cases: WatchCase[]): Impact {
  const candidate = applyChanges(p, changes);
  const households = cases.map((c) => {
    const before = diagnose(p, c.input);
    const after = diagnose(candidate, c.input);
    return {
      id: c.id,
      label: c.label,
      headlineBefore: before.householdHeadline.kind,
      headlineAfter: after.householdHeadline.kind,
      changed: before.householdHeadline.kind !== after.householdHeadline.kind,
      needBefore: before.self.rawNeed,
      needAfter: after.self.rawNeed,
    };
  });
  const invariantFailures = checkInvariants(candidate, cases);
  return {
    changedCount: households.filter((h) => h.changed).length,
    households,
    invariantFailures,
    safe: invariantFailures.length === 0,
  };
}
