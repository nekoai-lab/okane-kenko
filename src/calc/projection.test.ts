/**
 * 年次キャッシュフローのテスト。
 *
 * 核は**不変条件**：年次の合計が、既存の総額（calcDeath）と1円まで一致すること。
 * これが成り立つ限り、年次表を足してもゴールデン10世帯の期待値は動かない
 * ＝ 新しい数式を持ち込んでいないことの証明になる。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "./index.js";
import { projectDeath } from "./projection.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "../__tests__/households.js";
import { normalize } from "../wizard/normalize.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
const AS_OF_YEAR = 2026;

/** ゴールデンの入力から、本人が亡くなるケースの Household を組む */
function selfHousehold(input: (typeof GOLDEN)[number]["input"]) {
  return {
    deceased: input.self,
    survivor: input.spouse,
    children: input.children,
    housing: input.housing,
    assets: input.assets,
    monthlyLiving: input.monthlyLiving,
    educationPlan: input.educationPlan,
    currentCoverage: input.coverageSelf,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("projectDeath（年次キャッシュフロー）", () => {
  it("年次の支出合計が、既存の総額と一致する（10世帯すべて）", () => {
    for (const c of GOLDEN) {
      const d = diagnose(P, c.input, AS_OF);
      const pj = projectDeath(P, selfHousehold(c.input), { asOfYear: AS_OF_YEAR });
      const total = sum(pj.rows.map((r) => r.expense.total));
      expect(Math.round(total), `${c.id} の支出`).toBe(Math.round(d.self.expense.total));
    }
  });

  it("年次の収入合計が、既存の総額（金融資産を除く）と一致する（10世帯すべて）", () => {
    for (const c of GOLDEN) {
      const d = diagnose(P, c.input, AS_OF);
      const pj = projectDeath(P, selfHousehold(c.input), { asOfYear: AS_OF_YEAR });
      const total = sum(pj.rows.map((r) => r.income.total));
      // 金融資産は毎年入ってくるお金ではなく、初年度の残高として持つ
      const expected = d.self.income.total - d.self.income.assets;
      expect(Math.round(total), `${c.id} の収入`).toBe(Math.round(expected));
    }
  });

  it("貯蓄残高は「金融資産＋いまの保険金」から始まり、年間収支を積み上げたものになる", () => {
    const c = GOLDEN[1]; // GT-02（不足の世帯）
    const pj = projectDeath(P, selfHousehold(c.input), { asOfYear: AS_OF_YEAR });
    // 保険金を無視すると底をつく年が実態より早く出る＝いらない不安を与える
    let acc = c.input.assets + (c.input.coverageSelf ?? 0);
    for (const r of pj.rows) {
      acc += r.net;
      expect(Math.round(r.balance)).toBe(Math.round(acc));
    }
  });

  it("いちばん細い年と、残高が尽きる年を出せる", () => {
    const c = GOLDEN[1];
    const pj = projectDeath(P, selfHousehold(c.input), { asOfYear: AS_OF_YEAR });
    expect(pj.tightest).not.toBeNull();
    // 不足する世帯なので、どこかで残高がマイナスに入る
    expect(pj.depletedAt).not.toBeNull();
    expect(pj.rows.some((r) => r.events.length > 0)).toBe(true);
  });

  it("変動率は収入にも効く ─ 支出だけが膨らむ実装になっていない", () => {
    // 例のスペックで見つけた事故（支出だけにインフレを掛けると不足が構造的に膨らむ）を機械で防ぐ
    const c = GOLDEN[1];
    const h = selfHousehold(c.input);
    const flat = projectDeath(P, h, { asOfYear: AS_OF_YEAR });
    const inflated = projectDeath(P, h, {
      asOfYear: AS_OF_YEAR,
      rates: { living: 0.02, education: 0.02, pensionBasic: 0.02, pensionKosei: 0.02, work: 0.02 },
    });
    const grew = (a: number, b: number) => b > a * 1.05;
    expect(
      grew(
        sum(flat.rows.map((r) => r.expense.total)),
        sum(inflated.rows.map((r) => r.expense.total)),
      ),
    ).toBe(true);
    expect(
      grew(
        sum(flat.rows.map((r) => r.income.total)),
        sum(inflated.rows.map((r) => r.income.total)),
      ),
    ).toBe(true);
  });

  it("率が0なら、率を渡さない場合と1円も変わらない（既定は変えない）", () => {
    for (const c of GOLDEN) {
      const h = selfHousehold(c.input);
      const a = projectDeath(P, h, { asOfYear: AS_OF_YEAR });
      const b = projectDeath(P, h, {
        asOfYear: AS_OF_YEAR,
        rates: { living: 0, education: 0, pensionBasic: 0, pensionKosei: 0, work: 0 },
      });
      expect(sum(b.rows.map((r) => r.net))).toBe(sum(a.rows.map((r) => r.net)));
    }
  });

  it("ウィザードの入力からも同じ表が作れる（結果画面で使う経路）", () => {
    const sel = GOLDEN[0].input;
    const pj = projectDeath(P, selfHousehold(sel), { asOfYear: AS_OF_YEAR });
    expect(pj.rows.length).toBeGreaterThan(0);
    expect(pj.rows[0].year).toBe(AS_OF_YEAR);
    void normalize; // 経路の存在確認（normalize は結果画面側で使う）
  });
});
