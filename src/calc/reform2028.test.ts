/**
 * 2028年改正の該当判定（照合表 #6d）
 *
 * **「1世帯で正しく見えるテンプレートが、隣の世帯で嘘になる」型の検査。**
 *
 * 2026-09-21 まで、判定は「5年有期化の対象は子のいない配偶者 →
 * お子さんがいるこのご家庭は直撃しません」という因果で書かれていた。
 * サンプル世帯（配偶者38歳＝2028年度に40歳）では**結果が正しく出ていた**ため、
 * 画面を見ただけでは気づけなかった。配偶者35歳の世帯に通すと嘘になる。
 *
 * 本当の分かれ目は**配偶者の生年コホート**：
 * 女性で影響を受けるのは「18歳年度末までの子がいない、2028年度末時点で40歳未満」の人で、
 * **2028年度に40歳以上になる女性は現行どおり**（経過措置）。
 * 出典：厚生労働省「遺族厚生年金の見直しについて」
 * https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000147284_00020.html （2026-09-21 確認）
 *
 * **だから両コホートを固定する。** 片方だけのテストは、この型のバグを一切捕まえない。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { diagnose } from "./index.js";
import { reform2028 } from "./reform2028.js";

const AS_OF_YEAR = 2026;

describe("2028年改正：判定は子の有無ではなく配偶者の生年コホート", () => {
  it("2028年度に40歳以上になる配偶者は、子がいてもいなくても現行どおり", () => {
    // 2026年に38歳 → 2028年に40歳（経過措置に入る）
    const withKids = reform2028({ survivorAge: 38, asOfYear: AS_OF_YEAR, hasChildren: true });
    const noKids = reform2028({ survivorAge: 38, asOfYear: AS_OF_YEAR, hasChildren: false });
    for (const r of [withKids, noKids]) {
      expect(r.applicable).toBe(false);
      expect(r.reason).toContain("2028年度に40歳");
      expect(r.reason).toContain("当面これまで通り");
    }
  });

  it("**2028年度に40歳未満の配偶者は、子がいても該当する**（子は猶予にしかならない）", () => {
    // 2026年に35歳 → 2028年に37歳（影響コホート）
    const r = reform2028({ survivorAge: 35, asOfYear: AS_OF_YEAR, hasChildren: true });
    expect(r.applicable).toBe(true);
    expect(r.reason).toContain("40歳未満の区分");
    // **「お子さんがいるから直撃しません」と書かない。** 子が18歳を超えたあとに効く
    expect(r.reason).not.toContain("当面これまで通り");
    expect(r.reason).toContain("18歳の年度末を超えたあと");
    expect(r.reason).toContain("5年の有期給付");
  });

  it("子のいない40歳未満の配偶者にも該当する", () => {
    const r = reform2028({ survivorAge: 35, asOfYear: AS_OF_YEAR, hasChildren: false });
    expect(r.applicable).toBe(true);
    expect(r.reason).toContain("お子さんがいないため");
  });

  it("**女性は生年で分かれる旨を、どのコホートでも先に書く**", () => {
    for (const age of [35, 38, 50]) {
      const r = reform2028({ survivorAge: age, asOfYear: AS_OF_YEAR, hasChildren: true });
      expect(r.reason).toContain("女性の場合はさらに生年で分かれ");
    }
  });

  it("配偶者がいない世帯では、遺族厚生年金の見直し自体が関係しない", () => {
    const r = reform2028({ survivorAge: null, asOfYear: AS_OF_YEAR, hasChildren: false });
    expect(r.applicable).toBe(false);
    expect(r.reason).toContain("配偶者がいない");
  });

  it("境目は2028年度時点の年齢で決まる（診断年が違っても同じ結論になる）", () => {
    // どちらも2028年度に40歳
    const a = reform2028({ survivorAge: 38, asOfYear: 2026, hasChildren: true });
    const b = reform2028({ survivorAge: 39, asOfYear: 2027, hasChildren: true });
    expect(a.applicable).toBe(b.applicable);
    expect(a.applicable).toBe(false);
  });
});

/**
 * **ゴールデン10世帯に若い配偶者がいるか。**
 * いなければ、それはコーパスの穴であって「大丈夫」ではない。
 * ここで数えておき、0件なら合成入力で両コホートを踏んでいることを明示する。
 */
describe("コーパスの穴を数える", () => {
  it("10世帯の配偶者のコホート内訳を記録する（0件でも通すが、穴として残す）", () => {
    const P = loadParams("2026-08");
    const asOf = new Date("2026-08-01T00:00:00+09:00");
    const young = GOLDEN.filter((g) => {
      const age = g.input.spouse?.age;
      return age !== undefined && age + (2028 - 2026) < 40;
    });
    const judged = GOLDEN.map((g) => diagnose(P, g.input, asOf).reform2028.applicable);

    // 影響コホートの世帯数と、判定の結果が一致していること
    expect(judged.filter(Boolean).length).toBe(young.length);
    // **0件でも落とさない。** 落とすと正本（10世帯）をテストの都合で動かす圧力になる。
    // 代わりに上の合成入力テストが両コホートを踏んでいる
    expect(young.length).toBeGreaterThanOrEqual(0);
  });
});
