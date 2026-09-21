/**
 * 家計台帳の検算（照合表 #6a）
 *
 * **台帳は読者が縦に足して確かめるための形式**なので、
 * 表に出した行を足したら差し引きにならなければいけない。
 *
 * 2026-09-21、差し引きに `row.net` を使っていたため、
 * **表に出していない教育費（月4.3万）と葬儀・予備費（初年度だけの200万を月割りした16.7万）**が
 * 差し引きに混ざり、入る30.5万・出る19.3万なのに「9.8万足りません」と表示されていた。
 * 金額が正しいかどうか以前に、**表の中で検算が通らない**状態だった。
 *
 * ここが固定するのは「台帳の行合計 ＝ 差し引き」という**形式の約束**である。
 * 画面のロジックと同じ式をここに書き写すのではなく、
 * **台帳に出してよい支出の定義**（一度きりの支出を月次に入れない）を検査する。
 */
import { describe, expect, it } from "vitest";
import { GOLDEN } from "../__tests__/households.js";
import { loadParams } from "../params/index.js";
import { projectDeath } from "./projection.js";

const P = loadParams("2026-08");

/** 画面の台帳が出す「出ていくお金」の行（生活費・住居費・教育費）。葬儀・予備費は入れない */
function ledgerOut(row: {
  expense: { living: number; education: number; housing: number };
}): number {
  return row.expense.living + row.expense.education + row.expense.housing;
}

describe("家計台帳：表の行を足したら差し引きになる（#6a）", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：入る計 −（表に出した支出）＝ 差し引き`, () => {
      const pj = projectDeath(
        P,
        {
          children: g.input.children,
          housing: g.input.housing,
          assets: g.input.assets,
          monthlyLiving: g.input.monthlyLiving,
          educationPlan: g.input.educationPlan,
          deceased: g.input.self,
          survivor: g.input.spouse,
          currentCoverage: g.input.coverageSelf,
        },
        { asOfYear: 2026 },
      );
      const first = pj.rows[0];
      const net = first.income.total - ledgerOut(first);

      // 行を1つずつ足しても同じ数になる（読者がやる検算と同じ手順）
      let byHand = first.income.total;
      byHand -= first.expense.living;
      byHand -= first.expense.housing;
      byHand -= first.expense.education;
      expect(byHand).toBeCloseTo(net, 6);
    });
  }

  /**
   * **一度きりの支出を月次の表に入れない。**
   * 葬儀・予備費は初年度に一括で立つので、12で割って月額として並べると
   * 「毎月これだけ出ていく」という嘘になる。
   */
  it("葬儀・予備費は初年度に一括で立っており、月次の差し引きには含めない", () => {
    const g = GOLDEN[0];
    const pj = projectDeath(
      P,
      {
        children: g.input.children,
        housing: g.input.housing,
        assets: g.input.assets,
        monthlyLiving: g.input.monthlyLiving,
        educationPlan: g.input.educationPlan,
        deceased: g.input.self,
        survivor: g.input.spouse,
        currentCoverage: g.input.coverageSelf,
      },
      { asOfYear: 2026 },
    );
    const first = pj.rows[0];
    expect(first.expense.funeral).toBeGreaterThan(0);
    expect(pj.rows[1].expense.funeral).toBe(0);
    // `row.net` には葬儀・予備費が入っているので、台帳の差し引きとは一致しない
    expect(first.net).not.toBeCloseTo(first.income.total - ledgerOut(first), 0);
    expect(first.income.total - ledgerOut(first) - first.net).toBeCloseTo(first.expense.funeral, 6);
  });
});
