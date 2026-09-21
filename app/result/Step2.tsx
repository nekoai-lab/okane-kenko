/**
 * STEP2「もしものとき、暮らしはこうなる」（仕様 §5.3・照合表 #6a〜#6e）
 *
 * 家計台帳・段差チャート・段差の説明・接続文をまとめる。
 * **金額はここで作らない。** `projectDeath` の年次配列を月額に直して渡すだけ。
 */
import { manDigits, toMonthlyDisplay } from "../../src/design/ledgerRound.js";
import type { Projection } from "../../src/calc/projection.js";
import { REFORM_2028_NOT_APPLIED_TAIL } from "../../src/calc/reform2028.js";
import { MonthlyLedger } from "./MonthlyLedger.js";
import { StepChart, type StepYear } from "./StepChart.js";
import s from "./step2.module.css";

const MONTHS = 12;

/**
 * すでに表示単位に丸めた 円/月 → 1桁の文字列（単位は呼び出し側で付ける）。
 *
 * **台帳の数はすべて `toMonthlyDisplay` で丸めてから足し引きする**（`ledgerRound.ts`）。
 * 正確な値から行と合計を別々に丸めると 0.1 ずれて、**画面の中で検算が通らなくなる**
 * （2026-09-21：`11.1 + 6.0 + 13.3 = 30.4` なのに計が `30.5` と出ていた）。
 */
const bare = (yenMonthly: number) => manDigits(yenMonthly);

/**
 * 差し引きの文。**0 をまたぐ世帯を「ほぼ収支圏内」で誤魔化さない。**
 * 足りない側と残る側の両方を出す（どちらもあり得る、が事実）。
 */
function netText(low: number, high: number): { prefix: string; amount: string; suffix: string } {
  const p = "毎月";
  if (low === high) {
    return { prefix: p, amount: `約${manDigits(low)}万円`, suffix: low < 0 ? "足りません" : "残ります" };
  }
  if (low >= 0) {
    return { prefix: p, amount: `約${bare(low)}〜${bare(high)}万円`, suffix: "残ります" };
  }
  if (high <= 0) {
    return { prefix: p, amount: `約${bare(high)}〜${bare(low)}万円`, suffix: "足りません" };
  }
  return {
    prefix: p,
    amount: `約${bare(low)}万円足りない〜約${bare(high)}万円残る`,
    suffix: "の幅です",
  };
}

export interface Step2Props {
  pj: Projection;
  /** 遺される側の呼び名。本人死亡なら「配偶者」、配偶者死亡なら「あなた」 */
  survivorLabel: string;
  /** 各行が「どの回答から」来たか。回答に紐づかない行は null */
  from: {
    pension: string | null;
    kosei: string | null;
    work: string | null;
    housing: string | null;
    living: string | null;
    education: string | null;
  };
  /** 団信で住居費が消えているか（0円の行を出すかどうか） */
  danshinCovered: boolean;
  /**
   * 生活費の幅（円/月・すでに率と目盛りを掛けたもの）。
   * **幅の出どころは回答帯（D-01）**で、目盛り（D-02）ではない（ADR-022）。
   * 帯の上端が無い区分（`35万円以上`）や「年収から推定」では null。
   */
  livingBand: { low: number; high: number } | null;
  /** 2028年改正がこの世帯に該当するかの1行（`diagnose` の `reform2028.reason`） */
  reform2028Reason: string;
}

/**
 * ことばの説明（照合表 #6d）。文はモック `result.html` の `TERMS` から。
 *
 * モックは**タップで1つずつ切り替える**ボタン列。390px でも「1つずつ」は保ちたいが、
 * そのためだけにクライアントコンポーネントにするのは重いので、
 * **用語ごとの `<details>`** にした（同じ「1つずつ開く」挙動・JSなし）。
 */
const TERMS: { term: string; note: string }[] = [
  {
    term: "遺族基礎年金",
    note: "末のお子さんが18歳の年度末（高校を出るころ）まで続く、国からの毎月の仕送りです。お子さんの人数で金額が変わり、全員が18歳を超えるとまるごと終わります。",
  },
  {
    term: "遺族厚生年金",
    note: "会社員・公務員だった方の遺族への上乗せ分です。金額はおおむねご本人の厚生年金の4分の3。お子さんのいるご家庭では原則続きます。",
  },
  {
    term: "中高齢寡婦加算",
    note: "お子さんが18歳を超えて遺族基礎年金が止まったあとの急減をやわらげる、65歳までの上乗せです。65歳からはご自身の老齢年金に切り替わります。",
  },
  {
    term: "団信（団体信用生命保険）",
    note: "万一のとき住宅ローンが保険で完済されるしくみです。この診断で住まいの費用を保障の外に置いている理由です。",
  },
];

export function Step2({
  pj,
  survivorLabel,
  from,
  danshinCovered,
  reform2028Reason,
  livingBand,
}: Step2Props) {
  const first = pj.rows[0];
  if (!first) return null;

  const rows: StepYear[] = pj.rows.map((r) => ({
    year: r.year,
    survivorAge: r.ages.survivor,
    childAges: r.ages.children,
    pension: (r.income.pensionBasic + r.income.pensionKosei + r.income.chukoreiKafu) / MONTHS,
    work: r.income.work / MONTHS,
    living: r.expense.living / MONTHS,
    education: r.expense.education / MONTHS,
    // 大学期＝18〜21歳のお子さんがいる年（`params` の university.fromAge/toAge に合わせる）
    inUniversity: r.ages.children.some((a) => a >= 18 && a <= 21),
    events: r.events,
  }));

  // **表示単位に丸めた月額**で組む（行の和＝計、になる）
  const incomeRows = [
    { label: "遺族基礎年金＋子の加算", from: from.pension, m: toMonthlyDisplay(first.income.pensionBasic) },
    { label: "遺族厚生年金", from: from.kosei, m: toMonthlyDisplay(first.income.pensionKosei) },
    {
      /**
       * **中高齢寡婦加算の行を落とさない。**
       * 2026-09-21、この行が無く、初年度から加算が出る世帯（お子さんがいない・遺族が40〜64歳）で
       * **収入が月5.3万円ぶん丸ごと台帳から消えていた**。
       * 子のいる世帯では初年度 0 なので行が出ず、サンプル世帯では気づけなかった。
       */
      label: "中高齢寡婦加算",
      from: null,
      m: toMonthlyDisplay(first.income.chukoreiKafu),
    },
    {
      label: `${survivorLabel}の収入（手取り）`,
      from: from.work,
      m: toMonthlyDisplay(first.income.work),
    },
  ].filter((r) => r.m !== 0);
  const incomeTotalM = incomeRows.reduce((sum, r) => sum + r.m, 0);
  const incomes = incomeRows.map((r) => ({
    label: r.label,
    from: r.from,
    value: `約${bare(r.m)}万円`,
    tone: "income" as const,
  }));

  /**
   * **出ていくお金は、差し引きに使う行と1対1にする。**
   *
   * 台帳は読者が縦に足して確かめるための形式なので、
   * **表に出していない支出を差し引きに混ぜてはいけない**。
   * 2026-09-21、差し引きに `row.net` を使っていたため、表に無い教育費（月4.3万）と
   * 葬儀・予備費（初年度だけの200万を月割りした16.7万）が入り、
   * 入る30.5万・出る19.3万なのに「9.8万足りません」と出ていた。
   *
   * 葬儀・予備費は**一度きりの支出**なので月次の表には入れない（STEP3 の総額に入る）。
   */
  // 生活費の幅（月・表示単位に丸めたもの）。帯が無い区分では点
  const livingLowM = toMonthlyDisplay(livingBand ? livingBand.low * MONTHS : first.expense.living);
  const livingHighM = toMonthlyDisplay(
    livingBand ? livingBand.high * MONTHS : first.expense.living,
  );

  const otherRows = [
    ...(danshinCovered
      ? [{ label: "住宅ローン", from: from.housing, m: 0 }]
      : first.expense.housing > 0
        ? [{ label: "住居費", from: from.housing, m: toMonthlyDisplay(first.expense.housing) }]
        : []),
    ...(first.expense.education > 0
      ? [{ label: "教育費", from: from.education, m: toMonthlyDisplay(first.expense.education) }]
      : []),
  ];

  const expenses = [
    {
      label: "生活費",
      from: from.living,
      // 生活費だけは**回答帯の幅**で出す（D-01）。帯が無い区分では点のまま
      value:
        livingLowM === livingHighM
          ? `約${bare(livingLowM)}万円`
          : `約${bare(livingLowM)}〜${bare(livingHighM)}万円`,
      // **橙＝幅を持つ＝推定の揺れ**（組版の規約2）。幅が無いなら確定値として ink
      tone: (livingLowM === livingHighM ? "fixed" : "range") as "fixed" | "range",
    },
    ...otherRows.map((r) => ({
      label: r.label,
      from: r.from,
      value: r.m === 0 ? "0円" : `約${bare(r.m)}万円`,
      tone: "fixed" as const,
    })),
  ];

  /**
   * **差し引き＝入る計 −（表に出した支出の合計）。** 表の行を足せば必ずこの数になる。
   *
   * **幅を差し引きの手前で消さない**（D-01・2026-09-21）。
   * 生活費が帯で出ているのに差し引きが点だと、揺れが最後の1行で潰れる。
   * 生活費以外（住宅ローン・教育費）は点なので、幅は生活費の帯だけが作る：
   * - 下端（残りが最小）＝ 入る計 − 生活費の**上端** − その他
   * - 上端（残りが最大）＝ 入る計 − 生活費の**下端** − その他
   *
   * **すべて表示単位に丸めた数で計算する**ので、読者が画面の数字で足し引きしても必ず合う。
   */
  const othersM = otherRows.reduce((sum, r) => sum + r.m, 0);
  const netLowM = incomeTotalM - livingHighM - othersM;
  const netHighM = incomeTotalM - livingLowM - othersM;

  /**
   * 段差として出す年。
   *
   * **公的収入が実際に動いた年を、実数ぶん出す。** 枚数を固定しない。
   * 2026-09-21、`events` のある年から先頭3件を取っていたため、
   * **2036年の「子の加算が1人分減る」（月17.1万→15.1万）が枠からあふれて消えていた**。
   * 支出側のイベント（教育費が終わる等）が収入の段差より前に枠を使っていたのが原因。
   *
   * 初年度は段差ではない（`projection.ts` の「診断の起点」は起点であって変化ではない）。
   * 終端の行は段差ではないが、**算定がどこで切れるか**は落とせないので必ず足す。
   */
  const STEP_THRESHOLD = 1000; // 月1,000円未満の動きは段差と呼ばない
  const last = rows[rows.length - 1];
  const stepRows = rows.filter((r, i) => {
    if (i === 0 || r === last) return false;
    const prev = rows[i - 1];
    return Math.abs(r.pension - prev.pension) >= STEP_THRESHOLD;
  });
  const stepAndEnd = [...stepRows, last];

  return (
    <div className={s.step2}>
      <MonthlyLedger
        expenses={expenses}
        incomeTotal={`約${bare(incomeTotalM)}万円`}
        incomes={incomes}
        netAmount={netText(netLowM, netHighM).amount}
        netPrefix={netText(netLowM, netHighM).prefix}
        netSuffix={netText(netLowM, netHighM).suffix}
        netTone={netLowM < 0 ? "short" : "ok"}
      />

      <StepChart
        caption={`${rows[0].year}年から${rows[rows.length - 1].year}年までの、公的年金・就労収入・生活費の推移。単位は月あたりの円。`}
        rows={rows}
        stepYears={stepAndEnd.map((r) => r.year)}
        survivorLabel={survivorLabel}
      />

      {/*
        段差の説明。**西暦＋年齢＋制度の部品名**で書く（仕様の完了条件）。
        「何が起きて、いくらからいくらへ」まで出す ── 段差の高さが読めないと、図が絵で終わる。
      */}
      <ol className={s.steps}>
        {stepAndEnd.map((r, i) => {
          const prev = rows[rows.indexOf(r) - 1];
          const man = (v: number) => (v / 10_000).toFixed(1);
          const pensionMoved = prev !== undefined && Math.abs(prev.pension - r.pension) >= 1000;
          return (
            <li className={s.stepItem} key={r.year}>
              <span className={s.stepBadge}>{i + 1}</span>
              <div>
                <p className={s.stepWhen}>
                  {r.year}年{r.survivorAge !== null && `・${survivorLabel}${r.survivorAge}歳`}
                  {r.childAges.length > 0 && `／お子さん${r.childAges.join("・")}歳`}
                </p>
                <p className={s.stepWhat}>
                  {r.events.join("／")}
                  {/* **動いていない額を「◯から◯へ」と書かない。** 段差の無い年もあるため */}
                  {pensionMoved && (
                    <>
                      。公的年金は月{man(prev.pension)}万円から{man(r.pension)}万円へ
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* #6d ことばの説明。モックのタップ切替を、用語ごとの開閉に読み替えた */}
      <div className={s.terms}>
        <p className={s.termsHead}>ことばの説明 — 気になる用語を開いてください</p>
        {TERMS.map((t) => (
          <details className={s.term} key={t.term}>
            <summary>{t.term}</summary>
            <p className={s.termNote}>{t.note}</p>
          </details>
        ))}
        {/*
          2028年改正の注記。**語彙は `reform2028.ts` の1か所から取る**
          （失業カードの前提と同じ言い方にする。場所によって違う言い方だと別の話に見える）。
          モックは「施行後の制度にもとづいて計算します」と書いているが、
          **この実装はまだ反映していない**ので、そう書く。
        */}
        <p className={s.reform}>
          ※{reform2028Reason}
          {REFORM_2028_NOT_APPLIED_TAIL}
        </p>
      </div>

      <p className={s.bridge}>
        この「毎月の不足」と「大学の山」を、算定期間の全部で足し合わせたものが、次の STEP&nbsp;3
        の「必要な総額」です。葬儀・予備費のような一度きりの支出も、そこで足します。
      </p>
    </div>
  );
}
