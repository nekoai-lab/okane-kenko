/**
 * 両端の結果を1つのレンジに畳む（T-H・2026-09-23 オーナー裁定②）。
 *
 * **`[min(両端の low), max(両端の high)]` の包絡を取る。**
 * `max` だけだと下端の情報が落ちるし、端で**判定の枝が変わる**ことがあるので、
 * 単純に「緩め端の low と厳しめ端の high」を取ると**幅が潰れる**ことがある。
 *
 * 実例（GT-08 相当の世帯・生活費 ±2.5万/月）：
 * 緩め端 `sufficient` 400〜600万 ／ 厳しめ端 `shortage` 300〜400万。
 * 素直につなぐと 400〜400万になり、**厳しめに見たのに上端が下がる**。包絡なら 300〜600万。
 *
 * **数値をつなぐだけでは、一番大事な情報が消える。**
 * 「緩めに見れば足りている、厳しめに見れば足りない」という**判定の遷移**は、
 * 就労収入の感度文（`sensitivity.ts`）と同じ型で**文として出す**。
 */
import type { ParamSet } from "../params/index.js";
import type { Verdict } from "./types.js";
import { type DiagnoseInput, diagnose } from "./index.js";

export interface EnvelopeResult {
  /** 包絡した提示レンジ（円） */
  low: number;
  high: number;
  /** 緩め端・厳しめ端の判定（必要額の判定＝ニーズ軸） */
  verdictLoose: Verdict;
  verdictStrict: Verdict;
  /** **端で判定が違うか。** 違うなら、数値だけでは伝わらないので文を添える */
  crossed: boolean;
  /** 端ごとの素の結果（画面と検査のため） */
  ends: Array<{ low: number; high: number; verdict: Verdict }>;
}

/**
 * 候補の入力すべてで回し、包絡を取る。
 *
 * `inputs[0]` を緩め端、`inputs[1]` を厳しめ端として扱う（残りは包絡の材料）。
 * **順序に意味を持たせるのはここだけ**で、判定の遷移文はこの2つから作る。
 */
export function envelope(
  p: ParamSet,
  inputs: DiagnoseInput[],
  asOf: Date,
  who: "self" | "spouse" = "self",
): EnvelopeResult {
  if (inputs.length < 2) throw new Error("両端の入力が要る（緩め端・厳しめ端）");
  const ends = inputs.map((input) => {
    const d = diagnose(p, input, asOf);
    const r = who === "self" ? d.self : d.spouse;
    if (!r) throw new Error("配偶者のケースが無い");
    return { low: r.range.low, high: r.range.high, verdict: r.verdict };
  });

  return {
    low: Math.min(...ends.map((e) => e.low)),
    high: Math.max(...ends.map((e) => e.high)),
    verdictLoose: ends[0].verdict,
    verdictStrict: ends[1].verdict,
    crossed: ends[0].verdict !== ends[1].verdict,
    ends,
  };
}

/**
 * 判定が端で違うときの一文（感度文の型の再利用）。
 *
 * **数値は書かない。** 画面が `{{}}` に差し込むのと同じ理由で、
 * ここが返すのは「どの前提が外れたらどちらへ動くか」の**言い方**だけにする。
 * 金額は `EnvelopeResult` の値を画面がそのまま描く。
 */
export function crossingNote(r: EnvelopeResult): string | null {
  if (!r.crossed) return null;
  const say = (v: Verdict): string =>
    v === "shortage"
      ? "上乗せが要る"
      : v === "sufficient"
        ? "いまの蓄えで受けられる"
        : v === "ample"
          ? "上乗せは要らない"
          : "保障そのものが要らない";
  return `答えの幅の中で結論が変わります。緩めに見ると「${say(r.verdictLoose)}」、厳しめに見ると「${say(r.verdictStrict)}」です。幅はその両方を含んでいます。`;
}
