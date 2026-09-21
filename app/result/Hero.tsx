/**
 * 結果画面の冒頭ヒーロー（仕様 §5.3「ページ順」1）
 *
 * **移植元は `docs/design-mock/result.html` 冒頭のカード**（CLAUDE.md「design-mock は移植元」）。
 * 構成要素はモックのまま：判定バッジ ／ 明朝の大見出し ／ 現保障・必要額・前提の3列 ／
 * 「根拠をこのすぐ下にすべて示します」。**レイアウト・書体・構成要素をモックから変えない。**
 *
 * 唯一の改変は、**流す判定を単一リスク（死亡・本人）ではなく §1 の世帯4値にする**こと。
 * 製品が5リスクに広がったので、ページの顔が死亡1本の判定なのは実態と合わない。
 *
 * **金額はここで作らない。** 差額も `householdSummary`（src/calc）が出したものを受け取るだけ。
 */
import s from "./hero.module.css";

/** §1 の世帯4値。`pending` は現保障が未入力で判定しない */
export type HeroVerdict = "reducible" | "uncertain" | "shortage" | "rebalanceable" | "pending";

export interface HeroProps {
  verdict: HeroVerdict;
  /** 診断対象の世帯（モックの「サンプル: 40歳・会社員…」の位置） */
  caption: string;
  /** 見出しに差し込む差額。`reducible` / `shortage` / `rebalanceable` のときだけ使う */
  diffText: string | null;
  /** 必要額が葬儀費用だけになる世帯に添える1行（仕様 §5.3）。無ければ null */
  funeralOnlyNote: string | null;
  /**
   * `組み替えの余地` の世帯に添える金額の1行（仕様 §5.3・2026-09-21）。
   *
   * **見出しだけでは金額が1つも出ない。** 旧「検査値パネル」（`Vitals`）は
   * 「減らせる額（世帯）約1,800万円 ／ 一方で約200万円足りません」と両方を出していた。
   * ヒーローに一本化するにあたり、その2つを落とさないための行。
   */
  rebalanceNote: string | null;
  /** 3列。ラベルも値もモックの並びのまま */
  coverageText: string;
  needText: string;
  modeText: string;
}

const BADGE: Record<HeroVerdict, string> = {
  reducible: "減らせる可能性",
  uncertain: "圏内・要精査",
  shortage: "不足の可能性",
  rebalanceable: "組み替えの余地",
  pending: "判定は保留",
};

/**
 * 見出し文。**モックにある3判定は `result.html` の文をそのまま使う。**
 * モックに無い2つ（組み替えの余地・保留）は仕様 §5.3 に文を決めてから実装した。
 */
function headline(v: HeroVerdict, diff: string | null): string {
  switch (v) {
    case "reducible":
      return `いまの保障、${diff}ぶん 減らせる可能性があります`;
    case "uncertain":
      return "いまの保障は、必要額の幅の圏内です — ここでは言い切りません";
    case "shortage":
      return `いまの保障では、${diff}ほど 足りない可能性があります`;
    case "rebalanceable":
      return "保障の総量は足りていますが、置き場所に組み替えの余地があります";
    case "pending":
      return "いまの保障が分からないので、過不足はまだ出していません";
  }
}

export function Hero(props: HeroProps) {
  const {
    verdict,
    caption,
    diffText,
    funeralOnlyNote,
    rebalanceNote,
    coverageText,
    needText,
    modeText,
  } = props;

  return (
    <section className={s.hero} aria-labelledby="hero-head">
      <div className={s.topline}>
        <span className={s.eyebrow}>診断結果</span>
        <span className={s.sample}>{caption}</span>
      </div>

      <div>
        <span className={`${s.badge} ${s[verdict]}`}>{BADGE[verdict]}</span>
      </div>

      <h1 className={s.head} id="hero-head">
        {headline(verdict, diffText)}
      </h1>

      {/* 必要額が葬儀費用だけの世帯は、その理由を先に言う（仕様 §5.3） */}
      {funeralOnlyNote && <p className={s.funeral}>{funeralOnlyNote}</p>}

      {/* 組み替えの余地：どちらにいくら動かす話なのかを、見出しの直下で言う（仕様 §5.3） */}
      {rebalanceNote && <p className={s.funeral}>{rebalanceNote}</p>}

      <div className={s.stats}>
        <div>
          <p className={s.statLabel}>いまの死亡保障</p>
          <p className={s.statValue}>{coverageText}</p>
        </div>
        <div>
          <p className={s.statLabel}>必要額のめやす（幅）</p>
          <p className={`${s.statValue} ${s.need}`}>{needText}</p>
        </div>
        <div>
          <p className={s.statLabel}>暮らし方の前提</p>
          <p className={s.statValue}>{modeText}</p>
        </div>
      </div>

      <p className={s.lead}>この数字がどう出たか、根拠をこのすぐ下にすべて示します。</p>
    </section>
  );
}
