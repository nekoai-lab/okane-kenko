/**
 * シナリオ横断の診断アダプタ（再設計フェーズ1・タスク2）
 *
 * 仕様 `docs/redesign-spec-2026-09-21.md` §4-1。
 * パイプラインは3段で共通：①何が起きるか →②公的なしくみがどこまで受けるか →③残りを何で受けるか。
 * **リスクごとに変わるのは②の制度テーブルだけ**なので、シナリオはプラグインとして足していく。
 *
 * この層の約束：
 * - **既存 `diagnose` の上に乗るアダプタであって、置き換えではない。** `death` は丸ごと委譲する
 * - **変換で値を加工しない。** 既定値の補完も丸めもここでは新しく入れない
 *   （入れた瞬間、既存の経路と新しい経路で答えがズレる。ズレはテストを通り抜ける）
 * - **未実装のシナリオで例外を投げない。** 「計算未対応」は**エラーではなく正規の診断結果**で、
 *   診断表の未診断行と精度ラベルがこれを直接消費する（仕様 §5.3）
 */
import type { ParamSet } from "../params/index.js";
import { type DiagnoseInput, diagnose } from "./index.js";
import { type ProjectionRow, projectDeath } from "./projection.js";
import { jstYear } from "../time/jstYear.js";
import type { HouseholdDiagnosis } from "./types.js";

/** 全リスクを最初から閉じた列挙で切る。足すときに型が落ちて、対応漏れが見つかる */
export type Scenario = "death" | "sick_short" | "sick_long" | "disability" | "unemployment";

/** 精度ラベル（仕様 §1）。診断表の「精度」列がそのまま出す */
export type Precision =
  /** 回答からの試算 */
  | "calculated"
  /** 公的制度の計算式どおりの概算 */
  | "statutory_estimate"
  /** 計算未対応。**根拠なく数字を置かないための正直な空欄** */
  | "not_supported";

export type SimulateStatus = "ok" | "not_supported";

export interface NotSupported {
  /** 機械で分岐するための短い理由 */
  reason: "not_implemented";
  /** 画面の所見欄にそのまま出す文 */
  detail: string;
}

export interface SimulateResult {
  scenario: Scenario;
  status: SimulateStatus;
  precision: Precision;
  /**
   * 計算できたときだけ入る。**`not_supported` では null**。
   * 0 を置くと「0円で足りる」と読めてしまうので、計算未対応と0円を型で区別する。
   */
  amounts: { needLow: number; needHigh: number; currentCoverage: number | null } | null;
  /**
   * 年次キャッシュフロー。段差チャート・タイムライン・ラボ・ロードマップは
   * **すべてこの配列の別ビュー**（仕様 §4-2）。計算未対応のシナリオでは null。
   */
  yearly: ProjectionRow[] | null;
  /**
   * その年に起きること。段差チャートの注記①②③はここから引く（仕様 §5.3）。
   *
   * ⚠️ **この文言は人が書いた注記ではなく、年次の金額変化から自動生成している**
   * （`projection.ts`：前年と比べて遺族基礎年金が0になった、中高齢寡婦加算が立った、など）。
   * だからルールを二重に持たずに済む一方、**文面を画面側で言い換えるなら
   * 金額変化の判定まで遡って直す**こと。ここだけ書き換えると図と注記がずれる。
   */
  events: { year: number; elapsed: number; events: string[] }[] | null;
  /** 簡約・推定をすべてここに集める。`social.ts` の assumptions[] がそのまま流れ込む */
  assumptions: string[];
  /** `status === "not_supported"` のときだけ入る */
  notSupported: NotSupported | null;
  /** 出典（機関名＋制度名）。画面の出典チップ */
  sources: string[];
  /** `death` のときだけ入る、既存エンジンの結果そのもの（画面はまだこれを使う） */
  death: HouseholdDiagnosis | null;
}

/** まだ計算式を持っていないシナリオ。**空欄であることを結果として返す** */
const NOT_IMPLEMENTED: Record<Exclude<Scenario, "death">, string> = {
  sick_short:
    "入院・手術（〜3か月）の必要額は、まだ計算していません。根拠なく数字を置かないため、いまは空欄です。",
  sick_long:
    "長期休職（〜1年半）の必要額は、まだ計算していません。根拠なく数字を置かないため、いまは空欄です。",
  disability:
    "就業不能・障害（1年半超）の必要額は、まだ計算していません。根拠なく数字を置かないため、いまは空欄です。",
  unemployment:
    "失業は、基本手当と生活防衛資金で受ける領域です。保険で備える領域ではないため、必要額は出していません。",
};

function notSupported(scenario: Exclude<Scenario, "death">): SimulateResult {
  return {
    scenario,
    status: "not_supported",
    precision: "not_supported",
    amounts: null,
    yearly: null,
    events: null,
    assumptions: [],
    notSupported: { reason: "not_implemented", detail: NOT_IMPLEMENTED[scenario] },
    sources: [],
    death: null,
  };
}

export interface SimulateInput {
  /** 既存 `diagnose` に渡すのと**同じ形**。ここで詰め替えも補完もしない */
  answers: DiagnoseInput;
  /** 前提の目盛り（仕様 §4-6）。タスク4で効かせる。いまは受け取るだけ */
  assumptions?: { livingLevel?: "tight" | "asis" | "roomy" };
  asOf?: Date;
}

/**
 * シナリオ1本を回す。
 *
 * `death` は**既存 `diagnose` に丸ごと委譲する**。アダプタ側では入力を作り変えないので、
 * `simulate(x, "death")` と `diagnose(x)` は全フィールドで一致する（テストで固定している）。
 */
export function simulate(p: ParamSet, input: SimulateInput, scenario: Scenario): SimulateResult {
  if (scenario !== "death") return notSupported(scenario);

  // **入力をそのまま渡す。** 既定値の補完も丸めもここでは行わない
  const a = input.answers;
  const d = diagnose(p, a, input.asOf);

  // 年次キャッシュフロー。**結果画面と同じ引数で同じ関数を呼ぶ**（別経路で別の数を作らない）
  const projection = projectDeath(
    p,
    {
      children: a.children,
      housing: a.housing,
      assets: a.assets,
      monthlyLiving: a.monthlyLiving,
      educationPlan: a.educationPlan,
      deceased: a.self,
      survivor: a.spouse,
      currentCoverage: a.coverageSelf,
    },
    { asOfYear: jstYear(input.asOf ?? new Date()) },
  );

  return {
    scenario: "death",
    status: "ok",
    // 回答からの試算（制度式だけで出しているわけではない）
    precision: "calculated",
    amounts: {
      needLow: d.self.range.low,
      needHigh: d.self.range.high,
      currentCoverage: input.answers.coverageSelf,
    },
    yearly: projection.rows,
    // 何も起きない年は落とす（注記に使うのは段差のある年だけ）
    events: projection.rows
      .filter((r) => r.events.length > 0)
      .map((r) => ({ year: r.year, elapsed: r.elapsed, events: r.events })),
    // 既存エンジンが記録した推定を、そのまま前提として引き継ぐ
    assumptions: d.self.assumptions.map((a) => a.note),
    notSupported: null,
    sources: [`制度パラメータ版 ${d.paramVersion}`],
    death: d,
  };
}

/** 診断表（仕様 §5.3 の玄関）に出す5行ぶんを一度に回す */
export function simulateAll(p: ParamSet, input: SimulateInput): SimulateResult[] {
  const scenarios: Scenario[] = ["death", "sick_short", "sick_long", "disability", "unemployment"];
  return scenarios.map((s) => simulate(p, input, s));
}
