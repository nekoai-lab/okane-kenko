/**
 * statutory 3行（病気・けが短期／長期休職／失業）の出力を**まるごと固定する**（T-C）
 *
 * なぜ必要か：
 * - 必要額だけを見るテストは、**内訳が入れ替わっても合計が同じなら通ってしまう**。
 *   高額療養費が減って保険外が増えた、のような打ち消し合いを検出できない
 * - `ample` 枝の世帯が必要額を1点（葬儀費用）に潰すのと同じ問題が、
 *   statutory 側では「レンジの両端しか見ていない」という形で出る
 *
 * **ここが固定するのは「いまの出力」であって「正しさ」ではない。**
 * 制度改正で値が動くのは正常なので、落ちたときは
 * ①一次情報が変わったのか ②実装が壊れたのか を**先に切り分けてから**期待値を更新する。
 * パラメータの出どころは `params/2026-08.yaml` の `sources`（値・URL・施行日・verified）を見る。
 *
 * 軸名（CLAUDE.md「判定には必ず軸名を添える」）：
 * この3行の判定は**過不足の判定**（`Verdict3`。貯蓄という受け皿で足りるか）である。
 */
import { describe, expect, it } from "vitest";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "../__tests__/households.js";
import { simulate } from "./simulate.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

const SCENARIOS = ["sick_short", "sick_long", "unemployment"] as const;

describe("statutory 3行のスナップショット（T-C）", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：3シナリオの必要額・過不足の判定・前提を固定する`, () => {
      const shot = SCENARIOS.map((sc) => {
        const r = simulate(P, { answers: g.input, asOf: AS_OF }, sc);
        return {
          scenario: r.scenario,
          precision: r.precision,
          // 円単位で固定する。万円に丸めると数千円のズレが隠れる
          needLow: r.amounts?.needLow,
          needHigh: r.amounts?.needHigh,
          /** 過不足の判定（貯蓄という受け皿で足りるか） */
          verdictShortfall: r.verdict,
          assumptions: r.assumptions,
          sources: r.sources,
        };
      });
      expect(shot).toMatchSnapshot();
    });
  }
});

/**
 * 温存を時限化するための置き石（T-G・2026-09-21 オーナー決定）。
 *
 * 給付制限 `restrictionMonthsVoluntary: 2` は **2025-04-01 施行の改正（原則1か月）を反映していない**。
 * これは見落としではなく、**制度監視ウォッチャーが「改正を見つけて提案する」デモ素材として
 * わざと温存している**。`params/2026-08.yaml` の `sources.restrictionMonthsVoluntary.expires`
 * に期限（2026-10-05）を入れてある。
 *
 * **期待レンジを先に書いておく。** 更新したときに「なんとなく下がった」で通さないため。
 */
describe("T-G：給付制限 2→1 か月（未適用・温存中）", () => {
  /**
   * **前提コミット: 9352bd5 時点**（基本手当日額を令和8年8月1日値に更新したコミット）。
   *
   * 期待値を先に書く方式の弱点は、**先に書いた値が別コミットで古びる**こと。
   * 実際、日額更新で失業レンジが 17〜72万 → 11〜66万 に動き、この todo の両方の数字が
   * 現状と合わなくなった（2026-09-21）。前提コミットを添えておけば、
   * 次に日額が動いたときも「どの時点の値か」を突き合わせられる。
   * **日額が動いたら、この describe の期待値も実測で書き直すこと。**
   */
  it.todo(
    "サンプル世帯（40歳会社員・生活費27.5万/月・加入18年）の失業は 約11〜38万円 になる（いまは 約11〜66万円）【前提コミット: 9352bd5】",
  );
  /**
   * こちらは**日額に依存しない**。落ちるのは生活費1か月ぶんで、基本手当の額とは無関係のため
   * （給付制限のあいだは手当が出ず、生活費を丸ごと貯蓄で受ける、という項目）。
   */
  it.todo(
    "ゴールデン10世帯の needHigh が 20.0〜40.0万円 下がる。needLow と過不足の判定は動かない（日額に依存しない）",
  );
  it.todo("params の sources.restrictionMonthsVoluntary から expires と pendingChange を外す");
});
