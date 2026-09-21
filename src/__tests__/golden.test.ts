/**
 * ゴールデンテスト（受入基準 A-1 / PR-06）
 *
 * 算定エンジンは「同一入力・同一パラメータ版で必ず同一結果」でなければならない（AR-06）。
 * パラメータを更新したら必ずこのテストを再実行し、差分を記録すること。
 */
import { describe, expect, it } from "vitest";
import { diagnose } from "../calc/index.js";
import { RUSHING_WORDS } from "../narrate/guard.js";
import { loadParams } from "../params/index.js";
import { GOLDEN } from "./households.js";

const MAN = 10_000;
const P = loadParams("2026-08");
/** パラメータの有効期間内の日付で固定する（期限切れ検知テストは別途） */
const AS_OF = new Date("2026-08-17T12:00:00+09:00");
const man = (x: number) => Math.round(x / MAN);

describe("ゴールデンテスト：10世帯・19の死亡ケース", () => {
  for (const c of GOLDEN) {
    describe(`${c.id} ${c.label}`, () => {
      const r = diagnose(P, c.input, AS_OF);

      // 金額系と判定系を同じ it に混ぜない。混ぜると、判定の仕様を変えたときに
      // 金額のアサーションまで巻き添えで落ち、「落ちたら本物のバグ」の切り分けが効かなくなる。
      // **期待値は1つも変えていない。アサーションを2つの it に割っただけ。**
      it("本人が亡くなるケースの金額（レンジ・過不足額）が一致する", () => {
        expect(man(r.self.range.low)).toBe(c.expect.self.low);
        expect(man(r.self.range.high)).toBe(c.expect.self.high);
        expect(man(r.self.gap.amount)).toBe(c.expect.self.gapAmount);
      });

      it("本人が亡くなるケースの判定（verdict・過不足の種類）が一致する", () => {
        expect(r.self.verdict).toBe(c.expect.self.verdict);
        expect(r.self.gap.kind).toBe(c.expect.self.gap);
      });

      if (c.expect.spouse) {
        it("配偶者が亡くなるケースの金額（レンジ・過不足額）が一致する", () => {
          expect(r.spouse).not.toBeNull();
          expect(man(r.spouse!.range.low)).toBe(c.expect.spouse!.low);
          expect(man(r.spouse!.range.high)).toBe(c.expect.spouse!.high);
          expect(man(r.spouse!.gap.amount)).toBe(c.expect.spouse!.gapAmount);
        });

        it("配偶者が亡くなるケースの判定（verdict・過不足の種類）が一致する", () => {
          expect(r.spouse).not.toBeNull();
          expect(r.spouse!.verdict).toBe(c.expect.spouse!.verdict);
          expect(r.spouse!.gap.kind).toBe(c.expect.spouse!.gap);
        });
      }

      it("医療保障の判定が一致する", () => {
        expect(r.medical.verdict).toBe(c.expect.medical);
      });

      it("2028年改正の該当判定が一致する", () => {
        expect(r.reform2028.applicable).toBe(c.expect.reform2028);
      });

      it("世帯としての結論が一致する", () => {
        expect(r.householdHeadline.kind).toBe(c.expect.headline);
      });

      it("支出計と収入計が内訳の合計と一致する（内部整合）", () => {
        const e = r.self.expense;
        expect(e.total).toBeCloseTo(
          e.livingChild + e.livingAlone + e.education + e.housing + e.funeral,
          0,
        );
        const i = r.self.income;
        expect(i.total).toBeCloseTo(
          i.pensionBasic + i.pensionKosei + i.chukoreiKafu + i.survivorWork + i.assets,
          0,
        );
      });
    });
  }
});

describe("再現性（AR-06）", () => {
  it("同一入力を10回実行しても結論と全数値が一致する", () => {
    const c = GOLDEN[1]; // 本命ペルソナ（shortage が出るケース）
    const first = JSON.stringify(diagnose(P, c.input, AS_OF));
    for (let i = 0; i < 9; i++) {
      expect(JSON.stringify(diagnose(P, c.input, AS_OF))).toBe(first);
    }
  });
});

describe("芯の担保：煽らないこと", () => {
  it("扶養家族がいない世帯に『安心の上乗せ』を提示しない（葬儀・予備費のみ）", () => {
    const r = diagnose(P, GOLDEN[4].input, AS_OF); // GT-05 独身
    expect(r.self.verdict).toBe("not_needed");
    expect(r.self.range.low).toBe(r.self.expense.funeral);
    expect(r.self.range.high).toBe(r.self.expense.funeral);
  });

  it("余剰が大きい世帯には『上乗せも不要』と言い切る", () => {
    const r = diagnose(P, GOLDEN[8].input, AS_OF); // GT-09 高所得・貯蓄2000万
    expect(r.self.verdict).toBe("ample");
    expect(r.self.margin).toBeGreaterThan(r.self.expense.total * 0.2);
  });

  /**
   * **「煽らない」の定義（2026-09-21 オーナー確定）**
   *
   * 1. **事実と異なる安心を言わない**
   * 2. 不安を与える事実には「いつ・誰が・何が変わるか」を必ず添える
   * 3. **行動を急かす語彙を使わない**（語彙の本籍は `src/narrate/guard.ts` の `RUSHING_WORDS`）
   *
   * ここまで、このブロックには「子のいる世帯には『2028年改正は直撃しない』と言える」という
   * テストが置かれていた。**それは芯ではなく、芯の誤った実装を固定していた。**
   * 35歳の配偶者がいる世帯に「直撃しません」と言うのは事実と異なる安心で、
   * この製品が保険業界に対して批判している行為そのものだった（定義1に反する）。
   */
  it("影響コホートには『可能性があります』と言い、事実と異なる安心を言わない", () => {
    const affected = GOLDEN.filter((g) => diagnose(P, g.input, AS_OF).reform2028.applicable);
    expect(affected.length).toBeGreaterThan(0);
    for (const g of affected) {
      const reason = diagnose(P, g.input, AS_OF).reform2028.reason;
      expect(reason).toContain("可能性があります");
      expect(reason).not.toContain("直撃しません");
      expect(reason).not.toContain("ご安心");
      // 定義2：いつ・誰が・何が変わるかを添える
      expect(reason).toContain("2028年度");
      expect(reason).toMatch(/5年の有期給付|中高齢寡婦加算/);
    }
  });

  it("非影響コホートには『当面これまで通り』と言える", () => {
    const safe = GOLDEN.filter((g) => {
      const d = diagnose(P, g.input, AS_OF);
      return !d.reform2028.applicable && g.input.spouse !== null;
    });
    expect(safe.length).toBeGreaterThan(0);
    for (const g of safe) {
      expect(diagnose(P, g.input, AS_OF).reform2028.reason).toContain("当面これまで通り");
    }
  });

  it("**全世帯で、行動を急かす語彙を使わない**（語彙の本籍は guard.ts）", () => {
    for (const g of GOLDEN) {
      const reason = diagnose(P, g.input, AS_OF).reform2028.reason;
      for (const w of RUSHING_WORDS) {
        expect(reason).not.toContain(w);
      }
    }
  });

  it("『入らなくていい』と言える箇所が全体の過半で検出される（FR-19 / ADR-009）", () => {
    const reducible = GOLDEN.filter(
      (c) => diagnose(P, c.input, AS_OF).householdHeadline.totalExcess > 0,
    ).length;
    expect(reducible).toBeGreaterThan(GOLDEN.length / 2);
  });
});

describe("世帯単位で見ないと分からないこと（ADR-007）", () => {
  it("本人が過剰・配偶者が不足なら rebalanceable と判定する", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF); // GT-01
    expect(r.householdHeadline.kind).toBe("rebalanceable");
    expect(r.householdHeadline.totalExcess).toBeGreaterThan(0);
    expect(r.householdHeadline.totalShortage).toBeGreaterThan(0);
  });

  it("配偶者の保険が未入力でも診断は完走する（段階的に返す・ADR-007b）", () => {
    const { coverageSpouse, ...rest } = GOLDEN[0].input;
    const r = diagnose(P, rest, AS_OF);
    expect(r.spouse).toBeNull();
    expect(r.self.verdict).toBe("ample");
  });

  it("現在の保険が分からなくても必要額は出る（FR-14）", () => {
    const r = diagnose(P, { ...GOLDEN[1].input, coverageSelf: null }, AS_OF);
    expect(r.self.verdict).toBe("shortage");
    expect(r.self.gap.kind).toBe("pending");
    expect(r.self.assumptions.some((a) => a.field === "currentCoverage")).toBe(true);
  });
});

/**
 * 判定を支えている前提の開示（2026-09-21 オーナー決定）。
 *
 * **黙って置いた前提は、間違っているより悪い。** この世帯では配偶者の就労収入だけで
 * 4,320万円が収入に立ち、**これ単独で `ample` か `shortage` かが決まる**。
 * それだけの重みを持つ前提が `survivor.income === 0` のときしか画面に出ていなかった。
 *
 * ここが守るのは金額ではなく**開示そのもの**なので、5点それぞれを field で固定する。
 * 文面を変えるのは自由だが、項目を落としたらこのテストが落ちる。
 */
describe("判定を支えている前提を黙って置かない（ample系の開示）", () => {
  const FIELDS = [
    "survivor.income.flat", // ① 65歳まで定額で積んでいる
    "survivor.income.floor", // ② 子の独立後も下がらない床
    "survivor.disability", // ③ 配偶者自身の就業不能は起きない前提
    "childcare.extra", // ④ 追加の保育費・学童費用は見ていない
    "assets.growth", // ⑤ 期間中の新規貯蓄はゼロ
    "period.end", // ⑥ 配偶者65歳以降は対象外
    "params.vintage", // ⑦ 2028年4月施行の改正は未反映
  ];

  it("配偶者と子のいる `ample` 世帯では全項目を assumptions に出す", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF);
    for (const f of FIELDS) {
      expect(r.self.assumptions.map((a) => a.field)).toContain(f);
    }
  });

  /**
   * 文型ルール（仕様 §5.3・2026-09-21 オーナー承認）：
   * **否定の事実を書くときは、外れた場合に結果がどちらへ動くかまで同じ文で言う。**
   * 「見ていません」で終わる文は、読み手に「で、どうなるの」を残したまま閉じてしまう。
   */
  it("否定で終わる前提には、外れた場合の向きを必ず添える", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF);
    const flat = r.self.assumptions.find((a) => a.field === "survivor.income.flat");
    // 見出し語で拾い読みできること（全部読まないと分からない壁にしない）
    expect(flat!.label).toBeTruthy();
    expect(flat!.note).toContain("扱いです");
    expect(flat!.note).toContain("必要額は増えます");
    // **額面と手取りの役割を書き分ける。** 混ぜると掛け算の合わない文になる
    expect(flat!.note).toContain("手取りに換算して計算");

    const floor = r.self.assumptions.find((a) => a.field === "survivor.income.floor");
    expect(floor!.note).toContain("手取り 年");

    const childcare = r.self.assumptions.find((a) => a.field === "childcare.extra");
    expect(childcare!.note).toContain("必要額はその分増えます");
  });

  it("見出し語は体言止め、本文は です・ます（文型をそろえる）", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF);
    for (const a of r.self.assumptions) {
      if (!a.label) continue;
      expect(a.label.endsWith("。")).toBe(false);
      expect(a.note.endsWith("。")).toBe(true);
    }
  });

  it("2028年改正を反映していないことを、前提として必ず残す", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF);
    const vintage = r.self.assumptions.find((a) => a.field === "params.vintage");
    expect(vintage).toBeDefined();
    expect(vintage!.note).toContain("2028年4月");
  });

  it("**遺されるのが誰かで文言が逆にならない**（配偶者死亡のケースでも成り立つ書き方にする）", () => {
    const r = diagnose(P, GOLDEN[0].input, AS_OF);
    const notes = [...r.self.assumptions, ...(r.spouse?.assumptions ?? [])].flatMap((a) => [
      a.label ?? "",
      a.note,
    ]);
    // 配偶者が亡くなるケースでは遺されるのは本人なので、「配偶者が働き続ける」は事実と逆になる
    expect(notes.some((t) => t.includes("配偶者が働き続ける"))).toBe(false);
    expect(notes.some((t) => t.startsWith("配偶者が"))).toBe(false);
    // 配偶者が亡くなるケースでは遺されるのは本人なので「あなた」と呼ぶ
    const spouseCase = (r.spouse?.assumptions ?? []).find((a) => a.field === "period.end");
    expect(spouseCase!.note).toContain("あなたが65歳になるまで");
  });

  it("配偶者がいない世帯では、配偶者にまつわる前提を語らない", () => {
    // 配偶者なしで `not_needed` に落ちる世帯（開示が出る枝）を正本から取る
    const solo = GOLDEN.find((g) => {
      const d = diagnose(P, g.input, AS_OF);
      return g.input.spouse === null && (d.self.verdict === "not_needed" || d.self.verdict === "ample");
    });
    expect(solo).toBeDefined();
    const r = diagnose(P, solo!.input, AS_OF);
    const fields = r.self.assumptions.map((a) => a.field);
    expect(fields).not.toContain("survivor.income.flat");
    expect(fields).not.toContain("survivor.disability");
    expect(fields).not.toContain("period.end");
    // 貯蓄が増えない前提は配偶者の有無に関係なく効く
    expect(fields).toContain("assets.growth");
  });

  it("**`ample` 系でないときは出さない。** 幅が残っている世帯では前提が幅に表れている", () => {
    const shortage = GOLDEN.find((g) => diagnose(P, g.input, AS_OF).self.verdict === "shortage");
    expect(shortage).toBeDefined();
    const fields = diagnose(P, shortage!.input, AS_OF).self.assumptions.map((a) => a.field);
    expect(fields).not.toContain("survivor.income.flat");
  });
});

describe("自営世帯（遺族厚生年金なし）", () => {
  it("同条件の会社員より必要額が大きくなる", () => {
    const selfEmployed = diagnose(P, GOLDEN[5].input, AS_OF);
    const asEmployee = diagnose(
      P,
      { ...GOLDEN[5].input, self: { ...GOLDEN[5].input.self, employment: "employee" } },
      AS_OF,
    );
    expect(selfEmployed.self.income.pensionKosei).toBe(0);
    expect(selfEmployed.self.rawNeed).toBeGreaterThan(asEmployee.self.rawNeed);
  });
});

describe("団信の扱い（§9-6）", () => {
  it("団信が『分からない』ならありとして算定し、その事実を assumptions に残す", () => {
    const { danshin, ...housing } = GOLDEN[0].input.housing;
    const r = diagnose(P, { ...GOLDEN[0].input, housing }, AS_OF);
    expect(r.self.expense.housing).toBe(0);
    const a = r.self.assumptions.find((x) => x.field === "housing.danshin");
    expect(a).toBeDefined();
    expect(a!.note).toContain("団信がない場合は必要額が");
  });

  it("団信なしならローン残高が必要額に乗る", () => {
    const r = diagnose(P, GOLDEN[6].input, AS_OF); // GT-07
    expect(r.self.expense.housing).toBe(GOLDEN[6].input.housing.loan);
  });
});
