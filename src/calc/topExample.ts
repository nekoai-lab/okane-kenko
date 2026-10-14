/**
 * トップページ（LP）の「ある家族の、診断をのぞいてみる」の試算例（2026-10-15）
 *
 * **LP に金額を手で書かない。** 例の世帯を結果画面と同じ入口（URL クエリ → normalize → diagnose）に通し、
 * 出てきた値をそのまま返す。params が改定されれば、LP の数字も一緒に動く。
 *
 * 過不足は `verdict3` と同じ不等号で判定し、差は**幅で**返す（中心値は作らない。
 * アプリは幅の両端で判定していて、中心値を出す画面が無いため）。
 */
import type { ParamSet } from "../params/index.js";
import { toCompleteSelections } from "../wizard/complete.js";
import { normalize } from "../wizard/normalize.js";
import { decodeSelections } from "../wizard/url.js";
import { diagnose } from "./index.js";
import { type Verdict3, verdict3 } from "./verdict3.js";

/**
 * 例の世帯：37歳・会社員／配偶者35歳・専業（収入なし）／子2歳／持ち家・ローン2,000〜3,000万・団信あり／
 * 年収400〜600万・貯蓄100〜300万・生活費25〜30万／月・いまの死亡保障1,000万円
 */
export const TOP_EXAMPLE_QUERY =
  "v=1&sb=1989&emp=employee&sp=1&spb=1991&spe=none&sinc=none&ch=2024&edu=public&inc=lt600&as=lt300&liv=lt30&ho=own_loan&loan=lt3000&dan=yes&cvs=m1000&cvsp=none";

export interface TopExample {
  query: string;
  selfAge: number;
  spouseAge: number | null;
  childAges: number[];
  /** 遺されたご家族に必要な総額（円） */
  total: number;
  /** 遺族年金（基礎＋厚生＋中高齢寡婦加算）（円） */
  pension: number;
  /** 配偶者の就労収入（円） */
  survivorWork: number;
  /** 貯蓄・資産（円） */
  assets: number;
  /** 民間保険で備える額の幅（円）。結果画面の「必要額のめやす」と同じ値 */
  need: { low: number; high: number };
  /** 団信でローンが消える（住居費0円）か */
  danshinCovered: boolean;
  /** いまの死亡保障（円） */
  coverage: number;
  verdict: Verdict3;
  /** 不足なら「届かない額」、過剰なら「上回る額」の幅（円）。圏内なら null */
  gap: { low: number; high: number } | null;
}

export function topExample(p: ParamSet, asOf: Date): TopExample {
  const complete = toCompleteSelections(decodeSelections(new URLSearchParams(TOP_EXAMPLE_QUERY)));
  if (!complete) throw new Error("トップの試算例の入力が揃っていない");
  const { input } = normalize(p, complete, asOf);
  const r = diagnose(p, input, asOf).self;
  const coverage = input.coverageSelf;
  if (coverage === null) throw new Error("トップの試算例には、いまの保障が要る");

  const { low, high } = r.range;
  const v = verdict3(coverage, low, high);
  const gap =
    v === "shortage"
      ? { low: low - coverage, high: high - coverage }
      : v === "reducible"
        ? { low: coverage - high, high: coverage - low }
        : null;

  return {
    query: TOP_EXAMPLE_QUERY,
    selfAge: input.self.age,
    spouseAge: input.spouse?.age ?? null,
    childAges: input.children,
    total: r.expense.total,
    pension: r.income.pensionBasic + r.income.pensionKosei + r.income.chukoreiKafu,
    survivorWork: r.income.survivorWork,
    assets: r.income.assets,
    need: { low, high },
    danshinCovered:
      input.housing.type === "own" &&
      (input.housing.loan ?? 0) > 0 &&
      input.housing.danshin !== false,
    coverage,
    verdict: v,
    gap,
  };
}
