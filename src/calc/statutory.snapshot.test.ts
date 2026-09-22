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
import { PRE_TG } from "../paramwatch/__fixtures__/preTg.js";
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
 * **T-G：給付制限 2→1 か月（2026-09-23 適用済み）。**
 *
 * 2025-04-01 施行の改正（原則1か月）を、制度監視ウォッチャーが一次情報から見つけ、
 * 承認画面で人が承認したうえで適用した（提案ID `ydmcjrqmk0z85t4HypXy`）。
 * 温存していた旧値 2 は `params/2026-08.yaml` から消え、期限（`expires`）と
 * 改正予定（`pendingChange`）も外れている。
 *
 * **先に書いておいた期待レンジを、ここで実測に変える。**
 * 「なんとなく下がった」で通さないために置いた todo だったので、
 * 同じ数字を検査として残す（比較の相手は改正前の凍結コピー）。
 */
describe("T-G：給付制限 2→1 か月（適用済み）", () => {
  /** 改正前（給付制限2か月）の世界。差を測る相手 */
  const BEFORE = PRE_TG;

  /**
   * todo に書いてあったサンプル世帯そのもの（40歳会社員・生活費27.5万/月）。
   * 加入年数は設問に無く、`workStartAge`（22歳）から 18 年と置かれる。
   *
   * **前提コミット: 9352bd5**（基本手当日額を令和8年8月1日値に更新したコミット）。
   * 日額が動けば下端も動く。そのときは実測で書き直すこと。
   */
  const SAMPLE = {
    self: { age: 40, income: 600 * 10_000, employment: "employee" as const },
    spouse: null,
    children: [],
    housing: { type: "rent" as const },
    assets: 300 * 10_000,
    monthlyLiving: 27.5 * 10_000,
    educationPlan: "public" as const,
    coverageSelf: 0,
  };

  it("サンプル世帯（40歳会社員・生活費27.5万/月・加入18年）の失業は 約11〜38万円（改正前は 約11〜66万円）", () => {
    const after = simulate(P, { answers: SAMPLE, asOf: AS_OF }, "unemployment");
    const before = simulate(BEFORE, { answers: SAMPLE, asOf: AS_OF }, "unemployment");
    expect(after.amounts?.needLow).toBe(107_600);
    expect(after.amounts?.needHigh).toBe(382_600);
    expect(before.amounts?.needLow).toBe(107_600);
    expect(before.amounts?.needHigh).toBe(657_600);
    // 下がったぶんは生活費きっかり1か月（給付制限が1か月短くなったから）
    expect((before.amounts?.needHigh ?? 0) - (after.amounts?.needHigh ?? 0)).toBe(275_000);
  });

  /**
   * こちらは**日額に依存しない**。落ちるのは生活費1か月ぶんで、基本手当の額とは無関係のため
   * （給付制限のあいだは手当が出ず、生活費を丸ごと貯蓄で受ける、という項目）。
   */
  it("ゴールデン10世帯の needHigh が 20.0〜40.0万円 下がる。needLow と過不足の判定は動かない", () => {
    for (const g of GOLDEN) {
      const after = simulate(P, { answers: g.input, asOf: AS_OF }, "unemployment");
      const before = simulate(BEFORE, { answers: g.input, asOf: AS_OF }, "unemployment");
      const drop = (before.amounts?.needHigh ?? 0) - (after.amounts?.needHigh ?? 0);
      expect(drop, g.id).toBeGreaterThanOrEqual(200_000);
      expect(drop, g.id).toBeLessThanOrEqual(400_000);
      expect(after.amounts?.needLow, g.id).toBe(before.amounts?.needLow);
      /** 過不足の判定（貯蓄という受け皿で足りるか）は動かない */
      expect(after.verdict, g.id).toBe(before.verdict);
    }
  });

  it("params の sources.restrictionMonthsVoluntary に expires と pendingChange が無い（温存は終わった）", () => {
    const s = P.kihonTeate.sources?.restrictionMonthsVoluntary;
    expect(s?.expires).toBeUndefined();
    expect(s?.pendingChange).toBeUndefined();
    expect(s?.effectiveFrom).toBe("2025-04-01");
    expect(P.kihonTeate.restrictionMonthsVoluntary).toBe(1);
  });
});
