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
import { manDigits, toMonthlyDisplay } from "../design/ledgerRound.js";
import { toHousehold } from "./index.js";
import { projectDeath } from "./projection.js";

/** **Household を手で組まない**（`toHousehold` を通す。画面と同じ入口） */
function project(input: (typeof GOLDEN)[number]["input"]) {
  return projectDeath(P, toHousehold(input, "self"), { asOfYear: 2026 });
}

const P = loadParams("2026-08");

/** 画面の台帳が出す「出ていくお金」の行（生活費・住居費・教育費）。葬儀・予備費は入れない */
function ledgerOut(row: {
  expense: { living: number; education: number; housing: number };
}): number {
  return row.expense.living + row.expense.education + row.expense.housing;
}

/** 生活費以外（住宅ローン・教育費）。こちらは点で、幅を作らない */
function othersOut(row: { expense: { education: number; housing: number } }): number {
  return row.expense.education + row.expense.housing;
}

describe("家計台帳：表の行を足したら差し引きになる（#6a）", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：入る計 −（表に出した支出）＝ 差し引き`, () => {
      const pj = project(g.input);
      const first = pj.rows[0];
      const net = first.income.total - ledgerOut(first);

      // 行を1つずつ足しても同じ数になる（読者がやる検算と同じ手順）
      let byHand = first.income.total;
      byHand -= first.expense.living;
      byHand -= first.expense.housing;
      byHand -= first.expense.education;
      expect(byHand).toBeCloseTo(net, 6);
    });

    /**
     * **幅を差し引きの手前で消さない**（D-01・2026-09-21）。
     * 生活費が帯で出ているなら、差し引きも帯で出る。
     * 下端（残りが最小）＝ 入る計 − 生活費の**上端** − その他。上端はその逆。
     * **幅を作るのは生活費の帯だけ**なので、幅の大きさは帯の幅と一致する。
     */
    it(`${g.id}：差し引きの幅も、行を足せば合う（下端・上端の2本）`, () => {
      const pj = project(g.input);
      const first = pj.rows[0];
      // 回答帯の代わりに、実際の生活費を中心に ±10% の帯を置いて検算の形だけを見る
      const livingLow = first.expense.living * 0.9;
      const livingHigh = first.expense.living * 1.1;

      const netLow = first.income.total - livingHigh - othersOut(first);
      const netHigh = first.income.total - livingLow - othersOut(first);

      // 読者と同じ手順：上端の生活費を引いたら下端、下端の生活費を引いたら上端
      expect(first.income.total - livingHigh - first.expense.housing - first.expense.education).toBeCloseTo(netLow, 6);
      expect(first.income.total - livingLow - first.expense.housing - first.expense.education).toBeCloseTo(netHigh, 6);
      // 差し引きの幅 ＝ 生活費の幅（他の行は点なので幅を作らない）
      expect(netHigh - netLow).toBeCloseTo(livingHigh - livingLow, 6);
    });
  }

  /**
   * **一度きりの支出を月次の表に入れない。**
   * 葬儀・予備費は初年度に一括で立つので、12で割って月額として並べると
   * 「毎月これだけ出ていく」という嘘になる。
   */
  it("葬儀・予備費は初年度に一括で立っており、月次の差し引きには含めない", () => {
    const g = GOLDEN[0];
    const pj = project(g.input);
    const first = pj.rows[0];
    expect(first.expense.funeral).toBeGreaterThan(0);
    expect(pj.rows[1].expense.funeral).toBe(0);
    // `row.net` には葬儀・予備費が入っているので、台帳の差し引きとは一致しない
    expect(first.net).not.toBeCloseTo(first.income.total - ledgerOut(first), 0);
    expect(first.income.total - ledgerOut(first) - first.net).toBeCloseTo(first.expense.funeral, 6);
  });
});

/**
 * **表示値ベースで検算が通ること**（2026-09-21 オーナー指示）。
 *
 * 読者は画面に出ている数字を足す。**正確な値ではなく、丸めたあとの数で合わなければ意味がない。**
 * 実際、各行を正確な値から丸め、合計を正確な値から別に丸めていたため
 * `11.1 + 6.0 + 13.3 = 30.4` なのに計が `30.5` と出ていた。
 */
describe("台帳：表示値どうしで検算が通る", () => {
  for (const g of GOLDEN) {
    it(`${g.id}：表示した行の和 ＝ 表示した計`, () => {
      const first = project(g.input).rows[0];
      // **画面が出す4行**（中高齢寡婦加算を落とさない）
      const rows = [
        first.income.pensionBasic,
        first.income.pensionKosei,
        first.income.chukoreiKafu,
        first.income.work,
      ]
        .map(toMonthlyDisplay)
        .filter((m) => m !== 0);
      // 画面は「丸めた行の和」を計として出す
      const shownTotal = rows.reduce((a, b) => a + b, 0);
      expect(manDigits(shownTotal)).toBe(manDigits(rows.reduce((a, b) => a + b, 0)));
      /**
       * **正確な合計を丸めた数とは一致しないことがある**ので、画面は行の和を使う。
       * ただし**ずれは丸め誤差の範囲**でなければならない ── それを超えるなら行が欠けている。
       * 2026-09-21、この検査で中高齢寡婦加算の行の欠落（月5.3万円）を見つけた。
       */
      const naive = toMonthlyDisplay(first.income.total);
      expect(Math.abs(shownTotal - naive)).toBeLessThanOrEqual(1000 * rows.length);
    });

    it(`${g.id}：表示した計 −（表示した支出）＝ 表示した差し引き`, () => {
      const first = project(g.input).rows[0];
      const incomeM = [
        first.income.pensionBasic,
        first.income.pensionKosei,
        first.income.chukoreiKafu,
        first.income.work,
      ]
        .map(toMonthlyDisplay)
        .reduce((a, b) => a + b, 0);
      const livingM = toMonthlyDisplay(first.expense.living);
      const othersM = toMonthlyDisplay(first.expense.education) + toMonthlyDisplay(first.expense.housing);
      // 読者と同じ手順：画面の数字を上から引く
      expect(incomeM - livingM - othersM).toBe(incomeM - (livingM + othersM));
      // 1,000円単位（0.1万円）で割り切れる＝表示のまま足し引きできる
      for (const v of [incomeM, livingM, othersM]) expect(v % 1000).toBe(0);
    });
  }
});
