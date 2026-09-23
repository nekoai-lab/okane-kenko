/**
 * 入力の不確かさをエンジンに通す（T-H）の検査。
 *
 * ここが守るのは3つ。
 * 1. **方向表のとおりに端が作られる**（緩め端が必要額を減らす側・厳しめ端が増やす側）
 * 2. **端で判定が変わっても幅が潰れない**（包絡を取る）
 * 3. **未回答には幅を作らない**（区分が無いので、勝手に当社基準を増やさない）
 */
import { describe, expect, it } from "vitest";
import { crossingNote, envelope } from "../calc/envelope.js";
import { diagnose } from "../calc/index.js";
import { loadParams } from "../params/index.js";
import type { WizardSelections } from "./types.js";
import { crossingDrivers, normalizeEnds } from "./uncertainty.js";

const P = loadParams("2026-08");
const AS_OF = new Date("2026-08-01T00:00:00+09:00");

/** 子2人・専業主婦・賃貸。生活費は区分で回答（＝連動しない） */
const BASE: WizardSelections = {
  selfBirthYear: 1988,
  selfEmployment: "employee",
  selfIncome: "lt600",
  hasSpouse: true,
  spouseBirthYear: 1991,
  spouseEmployment: "none",
  spouseIncome: "none",
  childrenBirthYears: [2021, 2024],
  educationPlan: "public",
  assets: "lt300",
  livingCost: "lt30",
  housing: "rent",
  coverageSelf: "m1000",
  coverageSpouse: "none",
};

const needOf = (input: Parameters<typeof diagnose>[1]) => diagnose(P, input, AS_OF).self.rawNeed;

describe("方向表：緩め端は必要額を減らし、厳しめ端は増やす", () => {
  it("回答帯の端が入力に反映される（年収・生活費・資産）", () => {
    const e = normalizeEnds(P, BASE, AS_OF);
    // 年収 lt600 ＝ 400〜600万。**緩め端は上端**（遺族厚生年金が増えて必要額が減る）
    expect(e.loose.self.income).toBe(6_000_000);
    expect(e.strict.self.income).toBe(4_000_000);
    // 生活費 lt30 ＝ 25〜30万。**緩め端は下端**
    expect(e.loose.monthlyLiving).toBe(250_000);
    expect(e.strict.monthlyLiving).toBe(300_000);
    // 資産 lt300 ＝ 100〜300万。**緩め端は上端**
    expect(e.loose.assets).toBe(3_000_000);
    expect(e.strict.assets).toBe(1_000_000);
  });

  it("**実際に緩め端 ≦ 点 ≦ 厳しめ端**（方向表が実測と合っている）", () => {
    const e = normalizeEnds(P, BASE, AS_OF);
    const loose = needOf(e.loose);
    const point = needOf(e.point.input);
    const strict = needOf(e.strict);
    expect(loose).toBeLessThanOrEqual(point);
    expect(point).toBeLessThanOrEqual(strict);
    // 幅が本当に生まれている（点のままなら T-H の意味が無い）
    expect(strict).toBeGreaterThan(loose);
  });

  it("包絡したレンジは、点のレンジを内側に含む", () => {
    const e = normalizeEnds(P, BASE, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    const point = diagnose(P, e.point.input, AS_OF).self;
    expect(r.low).toBeLessThanOrEqual(point.range.low);
    expect(r.high).toBeGreaterThanOrEqual(point.range.high);
  });
});

describe("連動：生活費を年収から推定した世帯", () => {
  const ESTIMATE: WizardSelections = { ...BASE, livingCost: "estimate" };

  it("年収の端に生活費が連動する（年収が高い端では生活費も高い）", () => {
    const e = normalizeEnds(P, ESTIMATE, AS_OF);
    // 緩め端＝年収の上端なので、そこから出る生活費も高いほうになる
    expect(e.loose.self.income).toBe(6_000_000);
    expect(e.loose.monthlyLiving).toBeGreaterThan(e.strict.monthlyLiving);
  });

  it("**単調と言い切れないので、年収を逆向きにした候補も混ぜる**", () => {
    const e = normalizeEnds(P, ESTIMATE, AS_OF);
    expect(e.extra).toHaveLength(2);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    // 4候補すべてが包絡の内側にある
    for (const end of r.ends) {
      expect(end.low).toBeGreaterThanOrEqual(r.low);
      expect(end.high).toBeLessThanOrEqual(r.high);
    }
  });

  it("区分で答えた世帯では、逆向きの候補は作らない（2回で足りる）", () => {
    expect(normalizeEnds(P, BASE, AS_OF).extra).toHaveLength(0);
  });
});

describe("枝跨ぎ：端で判定が変わっても幅が潰れない", () => {
  /**
   * **GT-08 相当の世帯**（夫35・年収400万台／妻33・パート／子1人／賃貸／貯蓄少）。
   * 2026-09-23 の実測で、生活費を ±2.5万/月 動かすと
   * `sufficient` 400〜600万 ⇄ `shortage` 300〜400万 を跨ぐことが分かっている。
   * 素直につなぐと 400〜400万に潰れるので、**包絡で防ぐ**ことをここで固定する。
   */
  const GT08: WizardSelections = {
    selfBirthYear: 1991,
    selfEmployment: "employee",
    selfIncome: "lt400",
    hasSpouse: true,
    spouseBirthYear: 1993,
    spouseEmployment: "employee",
    spouseIncome: "lt400",
    childrenBirthYears: [2023],
    educationPlan: "public",
    assets: "lt100",
    livingCost: "lt30",
    housing: "rent",
    coverageSelf: "m500",
    coverageSpouse: "none",
  };

  it("判定が跨いだら crossed になり、レンジは両端の包絡になる", () => {
    const e = normalizeEnds(P, GT08, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    if (!r.crossed) {
      // 跨がない世帯でも包絡の性質は保つ（幅が潰れない）
      expect(r.low).toBeLessThanOrEqual(r.high);
      return;
    }
    expect(r.verdictLoose).not.toBe(r.verdictStrict);
    // **素直につないだ場合（緩め端の low 〜 厳しめ端の high）より広い**
    const naive = { low: r.ends[0].low, high: r.ends[1].high };
    expect(r.low).toBeLessThanOrEqual(naive.low);
    expect(r.high).toBeGreaterThanOrEqual(naive.high);
    expect(r.high).toBeGreaterThanOrEqual(r.low);
  });

  it("判定が跨いだときは文が出る／跨がないときは出さない", () => {
    const crossed = {
      low: 0,
      high: 0,
      verdictLoose: "sufficient" as const,
      verdictStrict: "shortage" as const,
      crossed: true,
      ends: [],
    };
    // 既存の感度文と同じ型：①何がこの幅を作っているか ②緩め／厳しめでどう変わるか
    expect(crossingNote(crossed)).toContain("この幅は、答えの幅");
    expect(crossingNote(crossed)).toContain("緩めに見ると");
    expect(crossingNote(crossed)).toContain("厳しめに見ると");
    // **数値は書かない**（金額は画面が算定結果から描く）
    expect(crossingNote(crossed)).not.toMatch(/[0-9]/);
    expect(crossingNote({ ...crossed, crossed: false })).toBeNull();
  });
});

/**
 * **跨ぎの種類ごとに1世帯ずつ固定する**（2026-09-23 オーナー裁定）。
 *
 * ここで確かめるのは**性質**（跨ぐこと・包絡が潰れないこと）であって金額ではない。
 * 金額の固定は、いちばん下の区分の**下端（当社基準）が確定してから**足す
 * ── いま書くと、床が決まった瞬間に嘘になる。
 */
describe("実例世帯：跨ぎの種類ごとに1つ", () => {
  const 専業子1: WizardSelections = {
    selfBirthYear: 1988,
    selfEmployment: "employee",
    selfIncome: "lt800",
    hasSpouse: true,
    spouseBirthYear: 1990,
    spouseEmployment: "none",
    spouseIncome: "none",
    childrenBirthYears: [2020],
    educationPlan: "public",
    assets: "lt300",
    livingCost: "lt30",
    housing: "rent",
    coverageSelf: "m1000",
    coverageSpouse: "none",
  };
  const 共働き子2: WizardSelections = {
    ...専業子1,
    selfIncome: "lt600",
    spouseEmployment: "employee",
    spouseIncome: "lt400",
    childrenBirthYears: [2021, 2024],
  };

  it("**sufficient ⇄ shortage** を跨ぐ世帯（専業・子1・年収 lt800）", () => {
    const e = normalizeEnds(P, 専業子1, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    expect(r.crossed).toBe(true);
    expect(r.verdictLoose).toBe("sufficient");
    expect(r.verdictStrict).toBe("shortage");
    // 包絡は両端を含む（素直につなぐと潰れる形になっていないこと）
    expect(r.low).toBeLessThanOrEqual(Math.min(...r.ends.map((x) => x.low)));
    expect(r.high).toBeGreaterThanOrEqual(Math.max(...r.ends.map((x) => x.high)));
    expect(crossingNote(r)).toContain("緩めに見ると");
  });

  /**
   * **`ample ⇄ sufficient`**。子2人・共働き（どちらも lt600）・生活費 lt35・私立中心。
   * 教育費が重いので、厳しめ端で余剰が消えて「上乗せの目安」が出る。
   */
  it("**ample ⇄ sufficient** を跨ぐ世帯（共働き・子2・私立・生活費 lt35）", () => {
    const sel: WizardSelections = {
      ...共働き子2,
      spouseIncome: "lt600",
      educationPlan: "private",
      livingCost: "lt35",
    };
    const e = normalizeEnds(P, sel, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    expect(r.crossed).toBe(true);
    expect(r.verdictLoose).toBe("ample");
    expect(r.verdictStrict).toBe("sufficient");
    expect(crossingNote(r)).not.toBeNull();
  });

  /**
   * **`ample ⇄ shortage`（2段跨ぎ）**。子2人・共働き（本人 lt600／配偶者 lt400）。
   *
   * **床を入れたことで跨ぎの種類が変わった世帯**（2026-09-23）。
   * 床を入れる前は `ample ⇄ sufficient` だったが、配偶者の年収 `lt400` の厳しめ端が
   * **床（106万円）**まで下がり、遺族の就労収入が大きく減るため `shortage` まで届く。
   * **この世帯がテストにいる理由は、床の効き方を1件で見せるため。**
   * 床が無ければ幅は `ample ⇄ sufficient` に収まって見え、
   * 「配偶者の年収が106万まで下がりうる」という厳しめ側の不確かさが画面から消える。
   * 将来ここを消したくなったら、**床を外したのと同じこと**だと思い出すこと。
   */
  it("**ample ⇄ shortage** を跨ぐ世帯（共働き・子2・配偶者 lt400 が床まで下がる）", () => {
    const e = normalizeEnds(P, 共働き子2, AS_OF);
    const r = envelope(P, [e.loose, e.strict, ...e.extra], AS_OF);
    expect(r.crossed).toBe(true);
    expect(r.verdictLoose).toBe("ample");
    expect(r.verdictStrict).toBe("shortage");
    // 厳しめ端の配偶者年収が床そのもの
    expect(e.strict.spouse?.income).toBe(P.ownStandard.incomeBandFloor.value);
    // **2段跨ぎだけ、あいだの判定と「幅が狭まる条件」を足す**（A＋D・2026-09-23 裁定）
    const driver = crossingDrivers(P, 共働き子2, AS_OF)[0];
    const note = crossingNote(r, driver);
    expect(note).toContain("あいだには");
    expect(note).toContain("はっきりすると狭まります");
    // **指示形にしない**（「確かめてください」とは書かない）
    expect(note).not.toContain("ください");
  });
});

describe("いちばん下の区分の床（当社基準）", () => {
  /** 床の値は在庫に1つだけ置き、帯はそれを参照する（数字を2か所に持たない） */
  it("在庫の値がそのまま厳しめ端に出る", () => {
    const floor = P.ownStandard.incomeBandFloor.value;
    expect(floor).toBe(1_056_000);
    const e = normalizeEnds(P, { ...BASE, selfIncome: "lt400" }, AS_OF);
    expect(e.strict.self.income).toBe(floor);
    // 緩め端は区分の上端のまま（床は下側だけの話）
    expect(e.loose.self.income).toBe(4_000_000);
  });

  it("床のある区分以外は、区分の境目がそのまま端になる", () => {
    const e = normalizeEnds(P, { ...BASE, selfIncome: "lt600" }, AS_OF);
    expect(e.strict.self.income).toBe(4_000_000);
    expect(e.loose.self.income).toBe(6_000_000);
  });

  /**
   * **2026-09-22 にオーナーが手で測った値（200〜700万）を再現する。**
   * そのときの条件は「生活費の帯だけを動かす」だったので、同じ条件で測る。
   * 全入力を端に振ると幅はもっと広くなる（床が効くため）が、**同じ条件なら同じ答え**になる。
   */
  it("組み替え世帯：生活費の帯だけを動かすと 200〜700万（9/22 実測の再現）", () => {
    const 組み替え: WizardSelections = {
      selfBirthYear: 1989,
      selfEmployment: "employee",
      selfIncome: "lt600",
      hasSpouse: true,
      spouseBirthYear: 1991,
      spouseEmployment: "employee",
      spouseIncome: "lt400",
      childrenBirthYears: [2024],
      educationPlan: "public",
      assets: "lt500",
      livingCost: "lt30",
      housing: "own_loan",
      loan: "lt3000",
      danshin: "yes",
      coverageSelf: "m2000",
      coverageSpouse: "none",
    };
    const e = normalizeEnds(P, 組み替え, AS_OF);
    const livingOnly = envelope(
      P,
      [
        { ...e.point.input, monthlyLiving: 250_000 },
        { ...e.point.input, monthlyLiving: 300_000 },
      ],
      AS_OF,
    );
    expect(livingOnly.low).toBe(2_000_000);
    expect(livingOnly.high).toBe(7_000_000);
    expect(livingOnly.verdictLoose).toBe("ample");
    expect(livingOnly.verdictStrict).toBe("sufficient");
  });
});

describe("未回答には幅を作らない（区分が無いので）", () => {
  it("「答えたくない」「分からない」は点のまま、かつ黙って落とさない", () => {
    const e = normalizeEnds(
      P,
      { ...BASE, selfIncome: "prefer_not", assets: "unknown", educationPlan: "undecided" },
      AS_OF,
    );
    // 点と同じ値（幅を作っていない）
    expect(e.loose.self.income).toBe(e.point.input.self.income);
    expect(e.strict.assets).toBe(e.point.input.assets);
    // 幅を作れなかったことが残る
    expect(e.pointOnly).toContain("ご本人の年収（答えたくない）");
    expect(e.pointOnly).toContain("金融資産（分からない）");
    expect(e.pointOnly).toContain("お子さんの進路（まだ決めていない）");
    // 幅を持てた入力の一覧には入らない
    expect(e.fields.map((f) => f.field)).not.toContain("selfIncome");
  });

  it("開いた区分（gte）は上端が無いので、その側は点のまま", () => {
    const e = normalizeEnds(P, { ...BASE, selfIncome: "gte1000" }, AS_OF);
    expect(e.strict.self.income).toBe(10_000_000); // 下端はある
    expect(e.loose.self.income).toBe(e.point.input.self.income); // 上端は無い＝点
  });
});
