/**
 * STEP2「もしものとき、暮らしはこうなる」（仕様 §5.3・照合表 #6a〜#6e）
 *
 * 家計台帳・段差チャート・段差の説明・接続文をまとめる。
 * **金額はここで作らない。** `projectDeath` の年次配列を月額に直して渡すだけ。
 */
import type { Projection } from "../../src/calc/projection.js";
import { REFORM_2028_NOT_APPLIED_TAIL } from "../../src/calc/reform2028.js";
import { MonthlyLedger } from "./MonthlyLedger.js";
import { StepChart, type StepYear } from "./StepChart.js";
import s from "./step2.module.css";

const MONTHS = 12;

/**
 * 円/年 → 表示用の 月あたり万円。
 * **万円・小数1桁にする。** モックの台帳も万円表記で、`111,000円/月` のような桁の多い表示は
 * 並べたときに比べられない（この台帳は「入る合計 vs 出る合計」を見る場所）。
 */
function perMonthMan(yen: number): string {
  return `約${(yen / MONTHS / 10_000).toFixed(1)}万円`;
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

  const incomes = [
    {
      label: "遺族基礎年金＋子の加算",
      from: from.pension,
      value: perMonthMan(first.income.pensionBasic),
    },
    { label: "遺族厚生年金", from: from.kosei, value: perMonthMan(first.income.pensionKosei) },
        {
      // **（手取り）と書く。** 年収200万 ÷ 12 ＝ 16.7万 と検算されると合わない
      //（エンジンは手取り率 0.8 を掛けた額を使っている）
      label: `${survivorLabel}の収入（手取り）`,
      from: from.work,
      value: perMonthMan(first.income.work),
    },
  ].filter((r) => r.value !== "約0.0万円");

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
  const expenseYen = [
    { label: "生活費", from: from.living, yen: first.expense.living },
    ...(danshinCovered
      ? [{ label: "住宅ローン", from: from.housing, yen: 0 }]
      : first.expense.housing > 0
        ? [{ label: "住居費", from: from.housing, yen: first.expense.housing }]
        : []),
    ...(first.expense.education > 0
      ? [{ label: "教育費", from: from.education, yen: first.expense.education }]
      : []),
  ];
  const expenses = expenseYen.map((r) => ({
    label: r.label,
    from: r.from,
    value: r.yen === 0 ? "0円" : perMonthMan(r.yen),
  }));

  // **差し引き＝入る計 −（表に出した支出の合計）。** 表の行を足せば必ずこの数になる
  const outTotal = expenseYen.reduce((sum, r) => sum + r.yen, 0);
  const netYear = first.income.total - outTotal;
  const short = netYear < 0;

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
        incomeTotal={perMonthMan(first.income.total)}
        incomes={incomes}
        netLabel="毎月 "
        netTone={short ? "short" : "ok"}
        netValue={
          short
            ? `${perMonthMan(Math.abs(netYear))} 足りません`
            : `${perMonthMan(netYear)} 残ります`
        }
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
