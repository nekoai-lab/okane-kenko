/**
 * 判断ポイント3行（仕様 §5.3 STEP4・照合表 #8c）
 *
 * **全行を `events` / 算定結果からバインドする。手書き禁止。**
 * モックの3行（正念場／団信／総額より期間の厚み）は**サンプル世帯の事実**であって、
 * 別の世帯にそのまま出すと嘘になる。だから「何を言うか」は世帯ごとに導出する。
 *
 * ここは `src/calc` に置く。理由は2つ：
 * - 文言をエンジン側に持つ方針（式を変えたときに文だけ古いまま残るのを防ぐ）
 * - **画面を開かずに検査できる**。3行の内容が世帯ごとに正しいかは、
 *   スクリーンショットではなくテストで見るべきもの
 *
 * 軸名（CLAUDE.md）：ここで使う `DeathResult.verdict` は**ニーズ軸**（必要額の判定）。
 */
import type { Projection } from "./projection.js";
import type { DeathResult } from "./types.js";

export interface DecisionPoint {
  /** 見出し語（体言止め） */
  label: string;
  /** 本文（です・ます）。**行動を急かす語彙を使わない** */
  body: string;
}

const MAN = 10_000;
const man = (yen: number) => Math.round(yen / MAN).toLocaleString("ja-JP");

/**
 * 正念場＝**公的年金が減る年と、大学期が重なるところ**。
 * どちらも `projection` から出る事実で、どちらか一方しか無い世帯もある。
 */
function hardYears(pj: Projection): DecisionPoint | null {
  const drops = pj.rows.filter((r, i) => {
    if (i === 0) return false;
    const pen = (x: (typeof pj.rows)[number]) =>
      x.income.pensionBasic + x.income.pensionKosei + x.income.chukoreiKafu;
    return pen(pj.rows[i - 1]) - pen(r) > MAN;
  });
  const uni = pj.rows.filter((r) => r.ages.children.some((a) => a >= 18 && a <= 21));

  if (drops.length === 0 && uni.length === 0) return null;

  if (drops.length > 0 && uni.length > 0) {
    const from = Math.min(drops[0].year, uni[0].year);
    const to = Math.max(drops[drops.length - 1].year, uni[uni.length - 1].year);
    return {
      label: `正念場は${from}〜${to}年ごろ`,
      // **動詞を繰り返さない。** 年を並べてから1回だけ言う
      body: `${drops.map((r) => `${r.year}年`).join("と")}に公的年金が下がり、${uni[0].year}〜${uni[uni.length - 1].year}年に大学の学費が重なります。備えの厚みが要るのはこの期間です。`,
    };
  }
  if (drops.length > 0) {
    return {
      label: `公的年金が下がるのは${drops.map((r) => `${r.year}年`).join("・")}`,
      body: "この前後で毎月の収支が変わります。備えの厚みが要るのはこの時期です。",
    };
  }
  return {
    label: `大学の学費がかかるのは${uni[0].year}〜${uni[uni.length - 1].year}年`,
    body: "この期間に支出が膨らみます。備えの厚みが要るのはここです。",
  };
}

/** 団信で住居費が消えているかどうか。消えていないなら、その額が総額に乗っている */
function housing(r: DeathResult, loan: number | null, danshinCovered: boolean): DecisionPoint {
  if (danshinCovered) {
    return {
      label: "住まいは団信で守られています",
      body: `万一のとき住宅ローン（残高 約${man(loan ?? 0)}万円）は保険で完済されるため、住居費のための保障は要りません。`,
    };
  }
  if (r.expense.housing > 0) {
    return {
      label: "住宅ローンは総額に乗っています",
      body: `団信が無い前提のため、ローン残高 約${man(r.expense.housing)}万円 がそのまま必要な総額に入っています。団信の有無を確かめると、ここが大きく動きます。`,
    };
  }
  return {
    label: "住居費は総額に入っていません",
    body: "持ち家でローンが無い、または賃貸で家賃を生活費に含めているためです。",
  };
}

/**
 * 3つ目は**この世帯でいちばん効いている前提**を出す。
 * 余剰がある世帯では、その余剰がどの前提の上に乗っているかが最も重要な事実になる
 * （ヒーローの感度文・滝の「余る分」の脚注と同じ事実を、判断の言葉で言う）。
 */
function biggestAssumption(r: DeathResult): DecisionPoint {
  if (r.margin > 0 && r.income.survivorWork > 0) {
    return {
      label: `緩衝材の約${man(r.margin)}万円は、就労の前提の上にあります`,
      body: `収入が支出を上回る見込みですが、その内訳には遺されたご家族の就労収入 約${man(r.income.survivorWork)}万円 が入っています。働き方が変わると、この余裕も変わります。`,
    };
  }
  if (r.income.survivorWork > 0) {
    return {
      label: `就労収入 約${man(r.income.survivorWork)}万円 が計算に入っています`,
      body: "この額が減ると、必要額はその分だけ増えます。前提のひとつとして見ておいてください。",
    };
  }
  return {
    label: "遺されたご家族の就労収入は見込んでいません",
    body: "公的年金と資産だけで見た必要額です。働ける見込みがあるなら、必要額はこれより下がります。",
  };
}

/**
 * 判断ポイントを3行作る。**世帯ごとに中身が変わる。**
 * 出せない行があるときは3行に満たなくてよい（無い事実を埋めない）。
 */
export function decisionPoints(
  r: DeathResult,
  pj: Projection,
  opts: { loan: number | null; danshinCovered: boolean },
): DecisionPoint[] {
  const hard = hardYears(pj);
  return [
    ...(hard ? [hard] : []),
    housing(r, opts.loan, opts.danshinCovered),
    biggestAssumption(r),
  ];
}
