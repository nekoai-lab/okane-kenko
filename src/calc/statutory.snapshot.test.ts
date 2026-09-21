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
